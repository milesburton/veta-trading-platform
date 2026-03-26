/**
 * Electron screenshot capture spec — generates docs/screenshots/electron-*.png for the README.
 *
 * Launches the packaged Electron app (dist-electron/main.js + dist/) and captures
 * representative screenshots showing the desktop application chrome and UI.
 *
 * Run:          xvfb-run --auto-servernum npx playwright test --config=playwright.electron.config.ts tests-electron/screenshots.spec.ts
 * Prerequisite: npm run electron:build
 * Output:       ../docs/screenshots/electron-*.png  (relative to frontend/)
 */

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_PATH = path.join(__dirname, "../dist-electron/main.js");
const OUT_DIR = path.resolve(__dirname, "../../docs/screenshots");

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { ELECTRON_RUN_AS_NODE: _drop, ...cleanEnv } = process.env;
  electronApp = await electron.launch({
    args: [MAIN_PATH, "--no-sandbox", "--disable-gpu"],
    env: {
      ...cleanEnv,
      NODE_ENV: "test",
    },
  });

  page = await electronApp.firstWindow();
  await page.waitForLoadState("load");
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── 1. Startup overlay (no backend — shows service status screen) ──────────────

test("electron screenshot: startup overlay", async () => {
  // The app launches without a backend so the startup overlay should appear
  const overlay = page.locator('[data-testid="startup-overlay"]');
  const dashboard = page.locator('[data-layout-path="tb"]');

  // Wait for either the overlay or dashboard — whichever renders first
  await expect(overlay.or(dashboard).first()).toBeAttached({ timeout: 15_000 });

  // Brief settle time for animations
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(OUT_DIR, "electron-01-startup.png"),
    fullPage: false,
  });
});

// ── 2. Full window — React root populated ────────────────────────────────────

test("electron screenshot: main window", async () => {
  const root = page.locator("#root");
  await expect(root).toBeAttached({ timeout: 15_000 });
  await expect(root).not.toBeEmpty({ timeout: 15_000 });

  await page.waitForTimeout(500);

  // Maximise to show the full UI surface
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(OUT_DIR, "electron-02-main-window.png"),
    fullPage: false,
  });
});
