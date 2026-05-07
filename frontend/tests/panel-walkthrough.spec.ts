/**
 * Panel walkthrough — opens every panel from PANEL_IDS, captures any console
 * errors, and screenshots each panel for review. Generates a JSON report at
 * docs/panel-walkthrough/report.json that lists per-panel verdicts.
 *
 * This is informational, not gating: the test always passes (apart from the
 * runner harness). The point is the report + screenshots, which provide a
 * baseline for spotting "this panel used to render, now it's blank" issues
 * without spending 30 minutes manually clicking through 51 panels.
 *
 * Persona: logs in as admin first; admin is the most permissive role (can
 * see all admin-only panels and all read-only panels). Trader-only panels
 * (order-ticket, order-blotter etc.) are skipped — covered separately by
 * the persona-specific dashboards in visual-anomalies.spec.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";

const REPORT_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../docs/panel-walkthrough",
);

// Mirror PANEL_IDS from frontend/src/components/dashboard/panelRegistry.ts.
// Kept inline (rather than importing) so the spec doesn't need to wire up
// Vite's import-meta.env at test time.
const ALL_PANEL_IDS = [
  "market-ladder",
  "order-ticket",
  "order-blotter",
  "child-orders",
  "algo-monitor",
  "observability",
  "candle-chart",
  "market-depth",
  "executions",
  "decision-log",
  "market-match",
  "admin",
  "news",
  "news-sources",
  "order-progress",
  "market-heatmap",
  "alerts",
  "option-pricing",
  "scenario-matrix",
  "trade-recommendation",
  "market-data-sources",
  "market-feed-control",
  "research-radar",
  "instrument-analysis",
  "signal-explainability",
  "service-health",
  "throughput-gauges",
  "algo-leaderboard",
  "load-test",
  "llm-subsystem",
  "greeks-surface",
  "vol-profile",
  "estate-overview",
  "yield-curve",
  "price-fan",
  "demo-day",
  "spread-analysis",
  "duration-ladder",
  "vol-surface",
  "basket-order",
  "client-rfq",
  "sales-workbench",
  "product-builder",
  "product-book",
  "session-replay",
  "risk-dashboard",
  "my-positions",
  "symbol-search",
  "dev-tools",
  "data-depth",
  "scenarios",
] as const;

type PanelVerdict = {
  panelId: string;
  rendered: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  screenshot: string | null;
  notes: string | null;
};

const verdicts: PanelVerdict[] = [];

test.afterAll(() => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    totalPanels: verdicts.length,
    rendered: verdicts.filter((v) => v.rendered).length,
    withConsoleErrors: verdicts.filter((v) => v.consoleErrors.length > 0).length,
    withPageErrors: verdicts.filter((v) => v.pageErrors.length > 0).length,
    skipped: verdicts.filter((v) => !v.rendered && v.notes).length,
    panels: verdicts,
  };
  fs.writeFileSync(
    path.join(REPORT_DIR, "report.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  // biome-ignore lint/suspicious/noConsole: informational test summary
  console.log(
    `[panel-walkthrough] ${summary.rendered}/${summary.totalPanels} rendered, ` +
      `${summary.withConsoleErrors} with console errors, ` +
      `${summary.withPageErrors} with page errors, ` +
      `${summary.skipped} skipped. Report: ${REPORT_DIR}/report.json`,
  );
});

test.describe("panel walkthrough (informational, non-gating)", () => {
  test("admin walks through every panel they can access", async ({ page }) => {
    test.setTimeout(15 * 60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.stack ?? err.message);
    });

    const app = new AppPage(page);
    await app.gotoAsAdmin();
    await page.waitForTimeout(500);

    for (const panelId of ALL_PANEL_IDS) {
      // Reset error buffers per panel so verdicts are isolated.
      consoleErrors.length = 0;
      pageErrors.length = 0;

      // Reload between panels: a previous panel may have crashed the
      // tab subtree or polluted the layout. Reload restores the default
      // admin layout so each iteration starts from a known-good state.
      await page.reload();
      await app.waitForDashboard().catch(() => {});
      await page.waitForTimeout(300);

      const picker = page.getByTestId("component-picker");
      const pickerToggle = picker.locator("button").first();

      try {
        await pickerToggle.click({ timeout: 5_000 });
      } catch {
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
          screenshot: null,
          notes: "could not open component picker",
        });
        continue;
      }

      const addBtn = page.getByTestId(`add-panel-${panelId}`);
      const visible = await addBtn.isVisible().catch(() => false);
      if (!visible) {
        // Admin doesn't have access to this panel (trader-only flag etc.)
        await page.keyboard.press("Escape").catch(() => {});
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [],
          pageErrors: [],
          screenshot: null,
          notes: "not accessible to admin role",
        });
        continue;
      }

      // Singleton panels that are already in the default layout render via
      // the existing layout; the picker entry is disabled. Screenshot the
      // current view (the panel is already visible) and mark as rendered.
      const isDisabled = await addBtn.isDisabled().catch(() => false);
      if (isDisabled) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(200);
        const screenshotPath = path.join(REPORT_DIR, "screenshots", `${panelId}.png`);
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
        try {
          const layout = page.locator(".flexlayout__layout");
          if ((await layout.count()) > 0) {
            await layout.first().screenshot({ path: screenshotPath });
          } else {
            await page.screenshot({ path: screenshotPath, fullPage: false });
          }
          verdicts.push({
            panelId,
            rendered: true,
            consoleErrors: [...consoleErrors],
            pageErrors: [...pageErrors],
            screenshot: path.relative(REPORT_DIR, screenshotPath),
            notes: "singleton already in default layout",
          });
        } catch (err) {
          verdicts.push({
            panelId,
            rendered: false,
            consoleErrors: [...consoleErrors],
            pageErrors: [...pageErrors],
            screenshot: null,
            notes: `singleton screenshot failed: ${(err as Error).message}`,
          });
        }
        continue;
      }

      try {
        await addBtn.click({ timeout: 5_000 });
      } catch {
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
          screenshot: null,
          notes: "click on add-panel-* failed",
        });
        await page.keyboard.press("Escape").catch(() => {});
        continue;
      }

      // Give the panel a moment to mount + emit any errors.
      await page.waitForTimeout(800);

      const screenshotPath = path.join(REPORT_DIR, "screenshots", `${panelId}.png`);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      try {
        const layout = page.locator(".flexlayout__layout");
        if ((await layout.count()) > 0) {
          await layout.first().screenshot({ path: screenshotPath });
        } else {
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }
      } catch (err) {
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
          screenshot: null,
          notes: `screenshot failed: ${(err as Error).message}`,
        });
        continue;
      }

      verdicts.push({
        panelId,
        rendered: true,
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        screenshot: path.relative(REPORT_DIR, screenshotPath),
        notes: null,
      });
    }

    // The test always passes — the verdicts in the report are the artefact.
    expect(verdicts.length).toBe(ALL_PANEL_IDS.length);
  });
});
