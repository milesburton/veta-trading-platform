import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

const GATEWAY = "/api/gateway";

type Method = "GET" | "POST" | "PUT";
type Route = readonly [Method, string];

const PROTECTED: readonly Route[] = [
  ["GET", "/me"],
  ["GET", "/assets"],
  ["GET", "/data-depth"],
  ["GET", "/candles"],
  ["GET", "/orders"],
  ["GET", "/pool/stats"],
  ["GET", "/ccp/stats"],
  ["GET", "/ccp/settlements"],
  ["GET", "/rfq"],
  ["GET", "/rfq/stats"],
  ["GET", "/rfq/sellside"],
  ["GET", "/rfq/sellside/stats"],
  ["POST", "/rfq/sellside"],
  ["GET", "/products"],
  ["GET", "/products/stats"],
  ["POST", "/products"],
  ["POST", "/grid/query"],
  ["GET", "/preferences"],
  ["PUT", "/preferences"],
  ["GET", "/shared-workspaces"],
  ["POST", "/shared-workspaces"],
  ["GET", "/market-data/sources"],
  ["GET", "/market-data/overrides"],
  ["PUT", "/market-data/overrides"],
  ["GET", "/audit/events"],
  ["GET", "/audit/verify"],
  ["GET", "/reports/transactions"],
  ["GET", "/alerts"],
  ["POST", "/alerts"],
  ["PUT", "/alerts/dismiss-all"],
  ["POST", "/analytics/quote"],
  ["POST", "/analytics/scenario"],
  ["POST", "/analytics/recommend"],
  ["POST", "/analytics/bond-price"],
  ["POST", "/analytics/yield-curve"],
  ["POST", "/analytics/spread-analysis"],
  ["POST", "/analytics/duration-ladder"],
  ["GET", "/intelligence/weights"],
  ["PUT", "/intelligence/weights"],
  ["GET", "/intelligence/recommendations"],
  ["POST", "/intelligence/scenario"],
  ["POST", "/intelligence/replay"],
  ["GET", "/advisory/jobs"],
  ["POST", "/advisory/request"],
  ["GET", "/advisory/admin/state"],
  ["PUT", "/advisory/admin/state"],
  ["POST", "/advisory/admin/watchlist-brief"],
  ["POST", "/advisory/admin/trigger-worker"],
  ["POST", "/load-test"],
  ["POST", "/demo-day"],
  ["POST", "/load-gen/start"],
  ["POST", "/load-gen/stop"],
  ["GET", "/load-gen/status"],
  ["GET", "/market-hours"],
];

const TRADER_FORBIDDEN: readonly Route[] = [
  ["GET", "/audit/events"],
  ["GET", "/audit/verify"],
  ["GET", "/reports/transactions"],
  ["PUT", "/market-data/overrides"],
  ["PUT", "/intelligence/weights"],
  ["GET", "/advisory/admin/state"],
  ["PUT", "/advisory/admin/state"],
  ["POST", "/advisory/admin/watchlist-brief"],
  ["POST", "/advisory/admin/trigger-worker"],
  ["POST", "/load-test"],
  ["POST", "/demo-day"],
  ["POST", "/load-gen/start"],
  ["POST", "/load-gen/stop"],
  ["GET", "/load-gen/status"],
  ["POST", "/products"],
  ["POST", "/rfq/sellside"],
];

const COMPLIANCE_ALLOWED: readonly Route[] = [
  ["GET", "/audit/events"],
  ["GET", "/audit/verify"],
  ["GET", "/reports/transactions"],
];

async function signInAs(browser: Browser, persona: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("login-page")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId("app-header")).toBeVisible({ timeout: 30_000 });
  await page.close();
  return context;
}

const RATE_LIMIT_RETRIES = 6;
const RATE_LIMIT_BACKOFF_MS = 600;

async function statusOf(context: BrowserContext, [method, path]: Route): Promise<number> {
  for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
    const res = await context.request.fetch(`${GATEWAY}${path}`, {
      method,
      data: method === "GET" ? undefined : {},
      failOnStatusCode: false,
    });
    if (res.status() !== 429) return res.status();
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS));
  }
  return 429;
}

async function statuses(context: BrowserContext, routes: readonly Route[]) {
  const results: { route: string; status: number }[] = [];
  for (const route of routes) {
    results.push({ route: `${route[0]} ${route[1]}`, status: await statusOf(context, route) });
  }
  return results;
}

test.describe("deploy-gate gateway access control", () => {
  test("every protected route refuses an anonymous caller", async ({ browser }) => {
    const anonymous = await browser.newContext();
    const results = await statuses(anonymous, PROTECTED);
    await anonymous.close();
    const leaked = results.filter((r) => r.status !== 401);
    expect(leaked, `routes answering an anonymous caller: ${JSON.stringify(leaked)}`).toEqual([]);
  });

  test("privileged routes refuse a trader", async ({ browser }) => {
    const trader = await signInAs(browser, "alice");
    const results = await statuses(trader, TRADER_FORBIDDEN);
    await trader.close();
    const allowed = results.filter((r) => r.status !== 403);
    expect(allowed, `routes a trader was not refused: ${JSON.stringify(allowed)}`).toEqual([]);
  });

  test("compliance can reach the audit and reporting routes", async ({ browser }) => {
    const compliance = await signInAs(browser, "compliance");
    const results = await statuses(compliance, COMPLIANCE_ALLOWED);
    await compliance.close();
    const refused = results.filter((r) => r.status === 401 || r.status === 403 || r.status >= 500);
    expect(refused, `routes compliance could not use: ${JSON.stringify(refused)}`).toEqual([]);
  });
});
