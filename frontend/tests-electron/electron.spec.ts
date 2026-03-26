/**
 * Electron E2E tests.
 *
 * These tests launch the packaged Electron app (dist-electron/main.js + dist/)
 * using Playwright's _electron fixture. They verify:
 *   1. The window opens and shows the correct title
 *   2. The startup overlay (loading screen) is displayed on launch
 *   3. The app loads the dashboard after startup
 *   4. The contextBridge API (window.electronAPI) is correctly exposed
 *   5. contextIsolation is enforced (no Node.js globals in renderer)
 *   6. IPC: minimize / maximize / close handlers are wired up
 *   7. A new pop-out window can be opened for localhost URLs
 *
 * Run: npm run test:electron
 * Prerequisite: npm run electron:build
 */

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the compiled main process entry (produced by electron:build)
const MAIN_PATH = path.join(__dirname, "../dist-electron/main.js");

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // ELECTRON_RUN_AS_NODE causes the binary to start in Node.js mode and reject
  // Chromium flags. Strip it before launching so Playwright's CDP handshake works.
  const { ELECTRON_RUN_AS_NODE: _drop, ...cleanEnv } = process.env;
  electronApp = await electron.launch({
    args: [MAIN_PATH, "--no-sandbox", "--disable-gpu", "--disable-software-rasterizer"],
    env: {
      ...cleanEnv,
      NODE_ENV: "test",
    },
    timeout: 60_000,
  });

  // Wait for the first BrowserWindow and for it to fully load
  page = await electronApp.firstWindow({ timeout: 60_000 });
  await page.waitForLoadState("load");
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── 1. Window title ────────────────────────────────────────────────────────────

test("window has correct title", async () => {
  const title = await page.title();
  expect(title).toMatch(/VETA/i);
});

// ── 2. Startup overlay ─────────────────────────────────────────────────────────

test("startup overlay or dashboard is shown on launch", async () => {
  // Either the startup overlay (no backend) or the dashboard (services healthy) should render.
  const overlay = page.locator('[data-testid="startup-overlay"]');
  const dashboard = page.locator('[data-layout-path="tb"]');
  await expect(overlay.or(dashboard).first()).toBeAttached({ timeout: 15_000 });
});

// ── 3. Dashboard loads ─────────────────────────────────────────────────────────

test("React root renders content", async () => {
  const root = page.locator("#root");
  await expect(root).toBeAttached({ timeout: 15_000 });
  await expect(root).not.toBeEmpty({ timeout: 15_000 });
});

// ── 4. contextBridge API is exposed ───────────────────────────────────────────

test("window.electronAPI is exposed via contextBridge", async () => {
  const hasApi = await page.evaluate(() => {
    return (
      typeof (window as Window & { electronAPI?: unknown }).electronAPI === "object" &&
      (window as Window & { electronAPI?: unknown }).electronAPI !== null
    );
  });
  expect(hasApi).toBe(true);
});

test("window.electronAPI exposes expected methods", async () => {
  const methods = await page.evaluate(() => {
    const api = (window as Window & { electronAPI?: Record<string, unknown> }).electronAPI;
    if (!api) return [];
    return Object.keys(api);
  });
  expect(methods).toContain("minimize");
  expect(methods).toContain("maximize");
  expect(methods).toContain("close");
  expect(methods).toContain("isMaximized");
  expect(methods).toContain("platform");
  expect(methods).toContain("appVersion");
  expect(methods).toContain("quit");
  expect(methods).toContain("onDeepLink");
  expect(methods).toContain("openExternal");
  expect(methods).toContain("showSaveDialog");
  expect(methods).toContain("writeFile");
});

test("platform is a valid value", async () => {
  const platform = await page.evaluate(() => {
    return (window as Window & { electronAPI?: { platform: string } }).electronAPI?.platform;
  });
  expect(["darwin", "win32", "linux"]).toContain(platform);
});

// ── 5. contextIsolation — no Node.js globals in renderer ──────────────────────

test("Node.js require is not accessible in renderer (contextIsolation enforced)", async () => {
  const hasRequire = await page.evaluate(() => {
    return typeof (globalThis as Record<string, unknown>)["require"] === "function";
  });
  expect(hasRequire).toBe(false);
});

test("Node.js process.versions is not accessible in renderer", async () => {
  const hasProcess = await page.evaluate(() => {
    // process.env is polyfilled by Vite, but process.versions is not
    return typeof (globalThis as Record<string, unknown>)["process"] !== "undefined" &&
      typeof (process as Record<string, unknown>)["versions"] !== "undefined";
  });
  // In a properly isolated renderer, process.versions should not be available
  expect(hasProcess).toBe(false);
});

// ── 6. IPC: isMaximized round-trip ────────────────────────────────────────────

test("isMaximized IPC round-trip returns a boolean", async () => {
  const result = await page.evaluate(async () => {
    const api = (window as Window & { electronAPI?: { isMaximized(): Promise<boolean> } }).electronAPI;
    if (!api) return null;
    return api.isMaximized();
  });
  expect(typeof result).toBe("boolean");
});

// ── 7. Electron main process: app metadata ────────────────────────────────────

test("electronApp.evaluate can read app name from main process", async () => {
  const appName = await electronApp.evaluate(({ app }) => app.getName());
  // The app name comes from package.json "productName" or "name"
  expect(typeof appName).toBe("string");
  expect(appName.length).toBeGreaterThan(0);
});

test("BrowserWindow is not maximized by default", async () => {
  const isMaximized = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win?.isMaximized() ?? false;
  });
  expect(isMaximized).toBe(false);
});

// ── 8. IPC: onDeepLink round-trip ─────────────────────────────────────────────

test("onDeepLink IPC: callback receives URL sent from main process", async () => {
  const listenerPromise = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const api = (
          window as Window & {
            electronAPI?: { onDeepLink(cb: (url: string) => void): () => void };
          }
        ).electronAPI;
        if (!api) {
          resolve("no-api");
          return;
        }
        const unsub = api.onDeepLink((url) => {
          unsub();
          resolve(url);
        });
      })
  );

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      "deeplink:navigate",
      "veta://dashboard?symbol=AAPL"
    );
  });

  const received = await listenerPromise;
  expect(received).toBe("veta://dashboard?symbol=AAPL");
});

// ── 9. quit() is a callable function ─────────────────────────────────────────

test("quit() is exposed as a function (does not invoke it)", async () => {
  const isFunction = await page.evaluate(() => {
    const api = (window as Window & { electronAPI?: Record<string, unknown> })
      .electronAPI;
    return typeof api?.["quit"] === "function";
  });
  expect(isFunction).toBe(true);
});
