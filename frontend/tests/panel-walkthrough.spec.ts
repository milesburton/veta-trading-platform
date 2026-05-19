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
import {
  EXTERNAL_CLIENT_LIMITS,
  EXTERNAL_CLIENT_USER,
  SALES_LIMITS,
  SALES_USER,
} from "./helpers/GatewayMock.ts";
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
  // Dedupe per panelId, preferring the verdict that successfully rendered.
  // The admin walkthrough runs first and emits a "not accessible" verdict
  // for the four trader-only panels; the role-specific walkthroughs then
  // emit a "rendered" verdict for the same panelId. Keep the rendered one.
  const byPanel = new Map<string, PanelVerdict>();
  for (const v of verdicts) {
    const prev = byPanel.get(v.panelId);
    if (!prev || (!prev.rendered && v.rendered)) {
      byPanel.set(v.panelId, v);
    }
  }
  const merged = [...byPanel.values()];
  const summary = {
    generatedAt: new Date().toISOString(),
    totalPanels: merged.length,
    rendered: merged.filter((v) => v.rendered).length,
    withConsoleErrors: merged.filter((v) => v.consoleErrors.length > 0).length,
    withPageErrors: merged.filter((v) => v.pageErrors.length > 0).length,
    skipped: merged.filter((v) => !v.rendered && v.notes).length,
    panels: merged,
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

// Panels covered only by the role-specific walkthroughs because the
// admin role can't open them.
const TRADER_ONLY_PANELS = ["order-ticket", "basket-order"] as const;
const SALES_ONLY_PANELS = ["sales-workbench"] as const;
const EXTERNAL_CLIENT_ONLY_PANELS = ["client-rfq"] as const;

async function walkPanels(
  app: AppPage,
  page: import("@playwright/test").Page,
  roleLabel: string,
  panelIds: readonly string[],
  consoleErrors: string[],
  pageErrors: string[],
  // Callback to re-send authIdentity after each reload. Admin sees every
  // non-trader-only panel regardless of trading_style, so the admin
  // walkthrough doesn't need this. Trader/sales/external-client panels
  // are gated on trading_style or role, so the identity (with limits)
  // must be re-sent before the picker is opened.
  reapplyAuth?: () => void,
): Promise<void> {
  for (const panelId of panelIds) {
    consoleErrors.length = 0;
    pageErrors.length = 0;

    // Reload between panels: a previous panel may have crashed the
    // tab subtree or polluted the layout. Reload restores the default
    // layout so each iteration starts from a known-good state.
    await page.reload();
    await app.waitForDashboard().catch(() => {});
    reapplyAuth?.();
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
        notes: `[${roleLabel}] could not open component picker`,
      });
      continue;
    }

    const addBtn = page.getByTestId(`add-panel-${panelId}`);
    const visible = await addBtn.isVisible().catch(() => false);
    if (!visible) {
      await page.keyboard.press("Escape").catch(() => {});
      verdicts.push({
        panelId,
        rendered: false,
        consoleErrors: [],
        pageErrors: [],
        screenshot: null,
        notes: `not accessible to ${roleLabel} role`,
      });
      continue;
    }

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
          notes: `[${roleLabel}] singleton already in default layout`,
        });
      } catch (err) {
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
          screenshot: null,
          notes: `[${roleLabel}] singleton screenshot failed: ${(err as Error).message}`,
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
        notes: `[${roleLabel}] click on add-panel-* failed`,
      });
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }

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
        notes: `[${roleLabel}] screenshot failed: ${(err as Error).message}`,
      });
      continue;
    }

    verdicts.push({
      panelId,
      rendered: true,
      consoleErrors: [...consoleErrors],
      pageErrors: [...pageErrors],
      screenshot: path.relative(REPORT_DIR, screenshotPath),
      notes: roleLabel === "admin" ? null : `captured by ${roleLabel} walkthrough`,
    });
  }
}

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

  test("trader walks through trader-only panels", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.stack ?? err.message);
    });

    const app = new AppPage(page);
    await app.gotoAsTrader();
    await page.waitForTimeout(500);

    const before = verdicts.length;
    await walkPanels(
      app,
      page,
      "trader",
      TRADER_ONLY_PANELS,
      consoleErrors,
      pageErrors,
      () => app.gateway.sendAuthIdentity({}),
    );
    expect(verdicts.length).toBe(before + TRADER_ONLY_PANELS.length);
  });

  test("sales walks through sales-only panels", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.stack ?? err.message);
    });

    const app = new AppPage(page);
    await app.gotoAsSales();
    await page.waitForTimeout(500);

    const before = verdicts.length;
    await walkPanels(
      app,
      page,
      "sales",
      SALES_ONLY_PANELS,
      consoleErrors,
      pageErrors,
      () => app.gateway.sendAuthIdentity({ user: SALES_USER, limits: SALES_LIMITS }),
    );
    expect(verdicts.length).toBe(before + SALES_ONLY_PANELS.length);
  });

  test("external-client walks through external-client-only panels", async ({ page }) => {
    test.setTimeout(3 * 60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.stack ?? err.message);
    });

    const app = new AppPage(page);
    await app.gotoAsExternalClient();
    await page.waitForTimeout(500);

    const before = verdicts.length;
    await walkPanels(
      app,
      page,
      "external-client",
      EXTERNAL_CLIENT_ONLY_PANELS,
      consoleErrors,
      pageErrors,
      () =>
        app.gateway.sendAuthIdentity({
          user: EXTERNAL_CLIENT_USER,
          limits: EXTERNAL_CLIENT_LIMITS,
        }),
    );
    expect(verdicts.length).toBe(before + EXTERNAL_CLIENT_ONLY_PANELS.length);
  });
});
