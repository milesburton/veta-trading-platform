/**
 * Panel walkthrough: opens every panel from PANEL_IDS, captures console and
 * page errors, scans the rendered DOM for known error markers (flexlayout's
 * "Error rendering component" banner, the app-level boundary, per-panel
 * "Could not reach ... service" states), and screenshots each panel. Writes
 * a JSON report at docs/panel-walkthrough/report.json.
 *
 * Four persona tests (admin / trader / sales / external-client) are
 * informational and always emit a verdict. A final "no panel captured with
 * error markers" test gates the run: if any panel ended up screenshotted in
 * an errored state, it throws, which fails the Playwright job and prevents
 * the workflow's commit-back step from publishing broken screenshots.
 *
 * Admin runs first as the most permissive role. Trader-only, sales-only,
 * and external-client-only panels are covered by the matching persona
 * tests because admin can't see them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, test } from "@playwright/test";
import {
  EXTERNAL_CLIENT_LIMITS,
  EXTERNAL_CLIENT_USER,
  SALES_LIMITS,
  SALES_USER,
} from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { findErrorMarkers } from "./helpers/screenshotGuard.ts";

const REPORT_DIR = path.resolve(fileURLToPath(import.meta.url), "../../../docs/panel-walkthrough");

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
  "load-gen",
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
  "platform-status",
  "order-routing-sankey",
  "world-clocks",
  "fix-sessions",
] as const;

type PanelVerdict = {
  panelId: string;
  rendered: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  errorMarkers?: string[];
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
  fs.writeFileSync(path.join(REPORT_DIR, "report.json"), `${JSON.stringify(summary, null, 2)}\n`);
  // biome-ignore lint/suspicious/noConsole: informational test summary
  console.log(
    `[panel-walkthrough] ${summary.rendered}/${summary.totalPanels} rendered, ` +
      `${summary.withConsoleErrors} with console errors, ` +
      `${summary.withPageErrors} with page errors, ` +
      `${summary.skipped} skipped. Report: ${REPORT_DIR}/report.json`
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
  reapplyAuth?: () => void
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
      const layout = page.locator(".flexlayout__layout");
      const scope = (await layout.count()) > 0 ? layout.first() : page;
      const markers = await findErrorMarkers(scope);
      if (markers.length > 0) {
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
          errorMarkers: markers,
          screenshot: null,
          notes: `[${roleLabel}] error markers in singleton view: ${markers.join(", ")}`,
        });
        continue;
      }
      try {
        if (scope === page) {
          await page.screenshot({ path: screenshotPath, fullPage: false });
        } else {
          await (scope as Locator).screenshot({ path: screenshotPath });
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
    const layout = page.locator(".flexlayout__layout");
    const scope = (await layout.count()) > 0 ? layout.first() : page;
    const markers = await findErrorMarkers(scope);
    if (markers.length > 0) {
      verdicts.push({
        panelId,
        rendered: false,
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        errorMarkers: markers,
        screenshot: null,
        notes: `[${roleLabel}] error markers after mount: ${markers.join(", ")}`,
      });
      continue;
    }
    try {
      if (scope === page) {
        await page.screenshot({ path: screenshotPath, fullPage: false });
      } else {
        await (scope as Locator).screenshot({ path: screenshotPath });
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

test.describe("panel walkthrough", () => {
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
        const layout = page.locator(".flexlayout__layout");
        const scope = (await layout.count()) > 0 ? layout.first() : page;
        const markers = await findErrorMarkers(scope);
        if (markers.length > 0) {
          verdicts.push({
            panelId,
            rendered: false,
            consoleErrors: [...consoleErrors],
            pageErrors: [...pageErrors],
            errorMarkers: markers,
            screenshot: null,
            notes: `error markers in singleton view: ${markers.join(", ")}`,
          });
          continue;
        }
        try {
          if (scope === page) {
            await page.screenshot({ path: screenshotPath, fullPage: false });
          } else {
            await (scope as Locator).screenshot({ path: screenshotPath });
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
      const layout = page.locator(".flexlayout__layout");
      const scope = (await layout.count()) > 0 ? layout.first() : page;
      const markers = await findErrorMarkers(scope);
      if (markers.length > 0) {
        verdicts.push({
          panelId,
          rendered: false,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
          errorMarkers: markers,
          screenshot: null,
          notes: `error markers after mount: ${markers.join(", ")}`,
        });
        continue;
      }
      try {
        if (scope === page) {
          await page.screenshot({ path: screenshotPath, fullPage: false });
        } else {
          await (scope as Locator).screenshot({ path: screenshotPath });
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
    await walkPanels(app, page, "trader", TRADER_ONLY_PANELS, consoleErrors, pageErrors, () =>
      app.gateway.sendAuthIdentity({})
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
    await walkPanels(app, page, "sales", SALES_ONLY_PANELS, consoleErrors, pageErrors, () =>
      app.gateway.sendAuthIdentity({ user: SALES_USER, limits: SALES_LIMITS })
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
        })
    );
    expect(verdicts.length).toBe(before + EXTERNAL_CLIENT_ONLY_PANELS.length);
  });

  // Gate: refuse to publish the walkthrough when any panel was captured in a
  // visibly errored state (flexlayout "Error rendering component", App-level
  // boundary, or a known per-panel error banner). The earlier persona tests
  // remain informational; this assertion fails the job and the workflow's
  // commit-back step never runs.
  //
  // Dedupe matches the afterAll logic: keep the rendered verdict if both a
  // rendered and an errored verdict exist for the same panel.
  test("no panel captured with error markers", () => {
    const byPanel = new Map<string, PanelVerdict>();
    for (const v of verdicts) {
      const prev = byPanel.get(v.panelId);
      if (!prev || (!prev.rendered && v.rendered)) {
        byPanel.set(v.panelId, v);
      }
    }
    const broken = [...byPanel.values()].filter((v) => (v.errorMarkers ?? []).length > 0);
    if (broken.length > 0) {
      const lines = broken.map((v) => `  ${v.panelId}: ${(v.errorMarkers ?? []).join(", ")}`);
      throw new Error(
        `${broken.length} panel(s) captured in an errored state. ` +
          `Refusing to publish screenshots.\n${lines.join("\n")}`
      );
    }
  });
});
