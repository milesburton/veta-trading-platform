import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { type AnomalyReport, findOverflows } from "./helpers/visualAnomalies.ts";

const REPORT_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../docs/visual-anomalies",
);

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
  fs.writeFileSync(
    path.join(REPORT_DIR, "report.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  const totalOverflow = reports.reduce((n, r) => n + r.overflows.length, 0);
  const totalAxe = reports.reduce((n, r) => n + r.axe.length, 0);
  console.log(
    `[visual-anomalies] ${reports.length} scenarios — ${totalOverflow} overflows, ${totalAxe} axe violations. Report: ${REPORT_DIR}/report.json`,
  );
});

async function captureAnomalies(
  page: import("@playwright/test").Page,
  scenario: string,
): Promise<AnomalyReport> {
  const overflows = await findOverflows(page);
  const axe = await new AxeBuilder({ page })
    .disableRules(["region"])
    .analyze();
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
        v.nodes[0]?.target?.[0] !== undefined
          ? String(v.nodes[0].target[0])
          : undefined,
    })),
  };
  reports.push(report);
  return report;
}

test.describe("visual anomalies (informational, non-gating)", () => {
  test("login page", async ({ page }) => {
    const READY_BODY = JSON.stringify({
      ready: true,
      startedAt: Date.now() - 300_000,
      upgradeInProgress: false,
      upgradeMessage: null,
      dataDepth: { totalSymbols: 5, avgDays: 3, minDays: 1, queriedAt: Date.now() },
      services: { bus: true, marketSim: true, userService: true, journal: true, ems: true, oms: true },
    });
    await Promise.all([
      page.route("/api/**", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: "null" }),
      ),
      page.route("/api/gateway/ready", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: READY_BODY }),
      ),
      page.route("/api/user-service/sessions/me", (r) =>
        r.fulfill({ status: 401, body: "" }),
      ),
    ]);
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
});
