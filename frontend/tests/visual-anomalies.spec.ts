import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DEFAULT_READY_BODY } from "./helpers/constants.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { type AnomalyReport, findOverflows } from "./helpers/visualAnomalies.ts";

const REPORT_DIR = path.resolve(fileURLToPath(import.meta.url), "../../../docs/visual-anomalies");

const reports: AnomalyReport[] = [];

test.afterAll(async () => {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    scenarios: reports.map((r) => ({
      scenario: r.scenario,
      url: r.url,
      overflowCount: r.overflows.length,
      axeCount: r.axe.length,
    })),
    reports,
  };
  fs.writeFileSync(path.join(REPORT_DIR, "report.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const totalOverflow = reports.reduce((n, r) => n + r.overflows.length, 0);
  const totalAxe = reports.reduce((n, r) => n + r.axe.length, 0);
  console.log(
    `[visual-anomalies] ${reports.length} scenarios — ${totalOverflow} overflows, ${totalAxe} axe violations. Report: ${REPORT_DIR}/report.json`
  );
});

async function captureAnomalies(
  page: import("@playwright/test").Page,
  scenario: string
): Promise<AnomalyReport> {
  const overflows = await findOverflows(page);
  const axe = await new AxeBuilder({ page }).disableRules(["region"]).analyze();
  const report: AnomalyReport = {
    scenario,
    url: page.url(),
    overflows,
    axe: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      description: v.description,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
      sampleSelector:
        v.nodes[0]?.target?.[0] !== undefined ? String(v.nodes[0].target[0]) : undefined,
      targets: v.nodes.slice(0, 5).map((n) => ({
        selector: String(n.target?.[0] ?? ""),
        html: n.html?.slice(0, 200) ?? "",
      })),
    })),
  };
  reports.push(report);
  return report;
}

test.describe("visual anomalies (merge-gating)", () => {
  test("login page", async ({ page }) => {
    const readyBody = JSON.stringify(DEFAULT_READY_BODY);
    await page.route("/api/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );
    await page.route("/api/gateway/ready", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: readyBody })
    );
    await page.route("**/api/user-service/sessions/me", (r) =>
      r.fulfill({ status: 401, body: "" })
    );
    await page.goto("/");
    await page.waitForSelector('[data-testid="login-page"]', { timeout: 10_000 });
    const r = await captureAnomalies(page, "login");
    expect(r.scenario).toBe("login");
  });

  test("trader dashboard", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();
    await page.waitForTimeout(500);
    const r = await captureAnomalies(page, "trader-dashboard");
    expect(r.scenario).toBe("trader-dashboard");
  });

  test("admin dashboard", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAdmin();
    await page.waitForTimeout(500);
    const r = await captureAnomalies(page, "admin-dashboard");
    expect(r.scenario).toBe("admin-dashboard");
  });

  test("algo trader dashboard", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAlgoTrader();
    await page.waitForTimeout(500);
    const r = await captureAnomalies(page, "algo-trader-dashboard");
    expect(r.scenario).toBe("algo-trader-dashboard");
  });

  test("fixed-income trader dashboard", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader();
    await page.waitForTimeout(500);
    const r = await captureAnomalies(page, "fi-trader-dashboard");
    expect(r.scenario).toBe("fi-trader-dashboard");
  });

  test("research analyst dashboard", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAnalyst();
    await page.waitForTimeout(500);
    const r = await captureAnomalies(page, "analyst-dashboard");
    expect(r.scenario).toBe("analyst-dashboard");
  });

  // Each named theme should render the trader dashboard cleanly. The
  // high-contrast theme exists in CSS but is otherwise never visually
  // tested — this scenario surfaces axe contrast or DOM overflow regressions
  // before they reach a user.
  //
  // Theme must be seeded via localStorage *before* the app loads, not by
  // setting the DOM attribute after the fact — themeSlice's Redux state is
  // the single source of truth for data-theme (App.tsx syncs the attribute
  // from state on every render), so a post-hoc attribute write gets
  // immediately overwritten by React's own effect on the next render.
  for (const theme of ["dark", "darker", "light", "high-contrast"] as const) {
    test(`trader dashboard — ${theme} theme`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("veta-theme", t);
      }, theme);
      const app = new AppPage(page);
      await app.gotoAsTrader();
      await page.waitForTimeout(500);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const r = await captureAnomalies(page, `trader-dashboard-${theme}`);
      expect(r.scenario).toBe(`trader-dashboard-${theme}`);
      if (theme === "light") {
        const contrastViolations = r.axe.filter((v) => v.id === "color-contrast");
        expect(contrastViolations, JSON.stringify(contrastViolations, null, 2)).toHaveLength(0);
      }
    });
  }
});
