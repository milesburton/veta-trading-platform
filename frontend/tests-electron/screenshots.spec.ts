/**
 * Electron screenshot capture spec — generates docs/screenshots/electron-*.png for the README.
 *
 * Launches the packaged Electron app (built with electron:build-test, which bakes
 * VITE_GATEWAY_URL/VITE_GATEWAY_WS_URL pointing at localhost:7777) and captures
 * representative screenshots showing the desktop application in action.
 *
 * Screenshots:
 *   electron-01-dashboard.png  — main dashboard with live market data
 *   electron-02-main-window.png — main window after pop-out is opened (channel linked)
 *   electron-03-linked-popout.png — the linked pop-out panel window
 *
 * Run:
 *   npm run electron:build-test
 *   xvfb-run --auto-servernum npx playwright test --config=playwright.electron.config.ts tests-electron/screenshots.spec.ts
 */

import { type ElectronApplication, type Page, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { _electron as electron } from "playwright";
import { fileURLToPath } from "url";
import { ElectronMockServer } from "./helpers/ElectronMockServer.ts";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAIN_PATH = path.join(__dirname, "../dist-electron/main.js");
const PACKAGED_ELECTRON_PATH = path.join(
  __dirname,
  "../dist-app/linux-unpacked/veta-trading-platform"
);
const OUT_DIR = path.resolve(__dirname, "../../docs/screenshots");

const PRICES = {
  AAPL: 189.5,
  MSFT: 421.0,
  GOOGL: 175.25,
  NVDA: 876.4,
  AMZN: 224.8,
};
function packagedElectronExecutablePath() {
  if (process.env.ELECTRON_EXECUTABLE_PATH) {
    return process.env.ELECTRON_EXECUTABLE_PATH;
  }
  return fs.existsSync(PACKAGED_ELECTRON_PATH) ? PACKAGED_ELECTRON_PATH : undefined;
}

const VOLUMES = {
  AAPL: 1_200_000,
  MSFT: 980_000,
  GOOGL: 760_000,
  NVDA: 1_450_000,
  AMZN: 540_000,
};

let mockServer: ElectronMockServer;
let electronApp: ElectronApplication;
let mainPage: Page;

test.beforeAll(async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  mockServer = await ElectronMockServer.start(7777);

  const { ELECTRON_RUN_AS_NODE: _drop, ...cleanEnv } = process.env;
  const executablePath = packagedElectronExecutablePath();
  electronApp = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      MAIN_PATH,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
    ],
    env: {
      ...cleanEnv,
      NODE_ENV: "test",
      DISPLAY: process.env.DISPLAY ?? ":99",
    },
    timeout: 60_000,
  });

  mainPage = await electronApp.firstWindow({ timeout: 60_000 });
  await mainPage.waitForLoadState("load");
});

test.afterAll(async () => {
  await electronApp?.close();
  await mockServer?.stop();
});

// ── Helper: wait for dashboard panels to render ───────────────────────────────

async function waitForDashboard(page: Page) {
  await page.waitForSelector(".flexlayout__tab", { timeout: 20_000 });
}

// Wait until the app is actually healthy before capturing, so we never shoot
// a "Connecting to market…" / "Service offline" frame. The chart overlay
// clears once candle bars arrive; the offline banner clears once /health
// polls succeed.
async function waitForHealthy(page: Page) {
  // Let the chart panel receive candle bars and the per-service /health polls
  // resolve before we capture, so we never shoot a "Connecting to market…" or
  // half-initialised frame.
  await page
    .waitForSelector("text=Connecting to market", { state: "detached", timeout: 15_000 })
    .catch(() => {});
  // Give the service-health poll round time to complete (33 services on an
  // interval), so the status bar shows the fleet up rather than 1/33.
  await page.waitForTimeout(4_000);
  // Dismiss any startup alert toast (e.g. the optional, cross-origin Traefik
  // dashboard which the mock does not serve) so the CRITICAL banner is not in
  // the shot. Best-effort: the controls only exist if a toast is showing.
  for (const label of ["Dismiss all", "Got it"]) {
    await page
      .getByText(label, { exact: false })
      .first()
      .click({ timeout: 2_000 })
      .catch(() => {});
  }
  await page.waitForTimeout(500);
}

// ── 1. Main dashboard with live market data ───────────────────────────────────

test("electron screenshot: main dashboard", async () => {
  await waitForDashboard(mainPage);

  mockServer.sendMarketUpdate(PRICES, VOLUMES);
  await waitForHealthy(mainPage);
  await mainPage.waitForTimeout(800);

  await mainPage.screenshot({
    path: path.join(OUT_DIR, "electron-01-dashboard.png"),
    fullPage: false,
  });
});

// ── 2 & 3. Main window + channel-linked pop-out ────────────────────────────────

test("electron screenshot: linked pop-out window", async () => {
  await waitForDashboard(mainPage);
  mockServer.sendMarketUpdate(PRICES, VOLUMES);
  await waitForHealthy(mainPage);
  await mainPage.waitForTimeout(400);

  // Open a pop-out panel via window.open — mirrors what usePopOut() does.
  // Must use the same file:// origin so setWindowOpenHandler allows it.
  // Pop out the market-ladder (live quotes) rather than an empty order
  // blotter, so the linked-pop-out screenshot shows meaningful content.
  const popOutPromise = electronApp.waitForEvent("window");

  await mainPage.evaluate(() => {
    const params = new URLSearchParams({
      panel: "market-ladder",
      type: "market-ladder",
      layout: "veta-layout-v5",
    });
    const url = `${globalThis.location.origin}${globalThis.location.pathname}?${params}`;
    globalThis.open(url, "panel-order-blotter", "width=700,height=600,resizable=yes");
  });

  const popOutPage = await popOutPromise;
  await popOutPage.waitForLoadState("load");
  // Wait for React to mount — pop-out renders PopOutHost directly (no AuthGate/StartupOverlay)
  await popOutPage.waitForSelector("#root > *", { timeout: 15_000 });
  await popOutPage.waitForTimeout(1_000);

  // Push a fresh tick so both windows show updated prices
  mockServer.sendMarketUpdate(
    { AAPL: 191.2, MSFT: 423.5, GOOGL: 174.8, NVDA: 882.1, AMZN: 226.3 },
    VOLUMES
  );
  await mainPage.waitForTimeout(600);

  // Position windows side-by-side for visual clarity
  await electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) wins[0].setBounds({ x: 0, y: 0, width: 1000, height: 800 });
    if (wins[1]) wins[1].setBounds({ x: 1000, y: 0, width: 600, height: 800 });
  });
  await mainPage.waitForTimeout(300);

  // Capture both windows separately
  await mainPage.screenshot({
    path: path.join(OUT_DIR, "electron-02-main-window.png"),
    fullPage: false,
  });

  await popOutPage.screenshot({
    path: path.join(OUT_DIR, "electron-03-linked-popout.png"),
    fullPage: false,
  });
});
