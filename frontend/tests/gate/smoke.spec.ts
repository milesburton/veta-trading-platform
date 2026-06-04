import { expect, test } from "@playwright/test";

test.describe("deploy-gate smoke", () => {
  test("frontend serves the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("login-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("login-heading")).toBeVisible();
  });

  test("gateway /sessions/me returns 401 for an anonymous session", async ({ request }) => {
    const res = await request.get("/api/gateway/api/user-service/sessions/me");
    expect(res.status()).toBe(401);
  });

  test("market-sim is producing prices via gateway", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByTestId("login-page")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("oauth-username").fill("alice");
    await page.getByTestId("oauth-password").fill("veta-dev-passcode");
    await page.getByTestId("oauth-submit").click();
    await expect(page.getByTestId("app-header")).toBeVisible({ timeout: 30_000 });

    const deadline = Date.now() + 30_000;
    let prices: Record<string, unknown> | null = null;
    while (Date.now() < deadline) {
      const res = await context.request.get("/api/gateway/api/market-sim/prices");
      if (res.ok()) {
        const body = await res.json();
        if (body && typeof body === "object" && Object.keys(body).length > 0) {
          prices = body as Record<string, unknown>;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    await context.close();
    expect(prices, "market-sim should have published at least one price within 30s").not.toBeNull();
  });

  test("login as alice and reach the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("login-page")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("oauth-username").fill("alice");
    await page.getByTestId("oauth-password").fill("veta-dev-passcode");
    await page.getByTestId("oauth-submit").click();

    await expect(page.getByTestId("app-header")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("login-page")).not.toBeVisible();
  });

  test("websocket gateway accepts a connection and emits at least one marketUpdate", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("login-page")).toBeVisible({ timeout: 15_000 });

    const wsOpened = page.waitForEvent("websocket", { timeout: 30_000 });
    await page.getByTestId("oauth-username").fill("alice");
    await page.getByTestId("oauth-password").fill("veta-dev-passcode");
    await page.getByTestId("oauth-submit").click();

    const ws = await wsOpened;
    expect(ws.url()).toMatch(/\/ws(\/gateway)?(\?|$)/);

    const sawMarketUpdate = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 20_000);
      ws.on("framereceived", ({ payload }) => {
        const text = typeof payload === "string" ? payload : (payload?.toString("utf8") ?? "");
        if (text.includes('"marketUpdate"') || text.includes('"event":"marketUpdate"')) {
          clearTimeout(timeout);
          resolve(true);
        }
      });
    });

    expect(sawMarketUpdate, "expected at least one marketUpdate frame on the WS within 20s").toBe(
      true
    );
  });
});
