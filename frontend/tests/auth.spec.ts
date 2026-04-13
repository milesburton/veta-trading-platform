import { test as base, expect } from "@playwright/test";
import { DEFAULT_ADMIN, DEFAULT_LIMITS, DEFAULT_TRADER } from "./helpers/GatewayMock.ts";
import { adminTest, traderTest } from "./helpers/fixtures.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

const READY_BODY = JSON.stringify({
  ready: true,
  startedAt: Date.now() - 300_000,
  upgradeInProgress: false,
  upgradeMessage: null,
  dataDepth: { totalSymbols: 5, avgDays: 3, minDays: 1, queriedAt: Date.now() },
  services: { bus: true, marketSim: true, userService: true, journal: true, ems: true, oms: true },
});

function setupUnauthPage(page: import("@playwright/test").Page) {
  return Promise.all([
    page.route("/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    ),
    page.route("**/health", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", version: "mock" }) })
    ),
    page.route("/api/gateway/ready", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY })
    ),
    page.route("/api/user-service/sessions/me", (route) =>
      route.fulfill({ status: 401, body: "" })
    ),
  ]);
}

base.describe("Unauthenticated", () => {
  base("shows login page on 401 session check", async ({ page }) => {
    await setupUnauthPage(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".flexlayout__tab")).not.toBeVisible();
  });

  base("shows login page on network error", async ({ page }) => {
    await page.route("/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );
    await page.route("/api/gateway/ready", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY })
    );
    await page.route("/api/user-service/sessions/me", (route) => route.abort("failed"));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });
  });

  base("login form hides OAuth2 implementation details", async ({ page }) => {
    await setupUnauthPage(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });
    const body = await page.locator("body").textContent();
    expect(body).not.toMatch(/OAuth2/i);
    expect(body).not.toMatch(/PKCE/i);
  });

  base("valid credentials reach the dashboard", async ({ page }) => {
    await page.route("/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );
    await page.route("**/health", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", version: "mock" }) })
    );
    await page.route("/api/gateway/ready", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY })
    );
    let sessionExists = false;
    await page.route("/api/user-service/sessions/me", (route) => {
      if (sessionExists) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "AL" }),
        });
      }
      return route.fulfill({ status: 401, body: "" });
    });
    await page.route("/api/user-service/oauth/authorize", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: "test-code", redirect_uri: "postmessage", expires_in: 60, scope: "openid profile" }),
      })
    );
    await page.route("/api/user-service/oauth/token", (route) => {
      sessionExists = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Set-Cookie": "veta_user=test-token; HttpOnly; Path=/; Max-Age=28800" },
        body: JSON.stringify({
          access_token: "test-token",
          token_type: "bearer",
          expires_in: 28800,
          scope: "openid profile",
          user: { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "AL" },
        }),
      });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("oauth-username").fill("alice");
    await page.getByTestId("oauth-password").fill("veta-dev-passcode");
    await page.getByTestId("oauth-submit").click();
    await expect(page.getByRole("heading", { name: /^sign in$/i })).not.toBeVisible({ timeout: 10_000 });
  });

  base("invalid credentials show error", async ({ page }) => {
    await setupUnauthPage(page);
    await page.route("/api/user-service/oauth/authorize", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "invalid_credentials" }) })
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("oauth-username").fill("alice");
    await page.getByTestId("oauth-password").fill("wrong");
    await page.getByTestId("oauth-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("login-error")).toContainText(/sign in failed/i);
  });
});

traderTest.describe("Trader session", () => {
  traderTest("reaches dashboard", async ({ app }) => {
    await expect(app.page.locator(".flexlayout__tab").first()).toBeVisible();
  });

  traderTest("user name appears in header", async ({ app }) => {
    await expect(app.page.getByText(DEFAULT_TRADER.name, { exact: false })).toBeVisible({ timeout: 5_000 });
  });

  traderTest("custom limits reflected in ticket", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: DEFAULT_TRADER });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_TRADER, limits: { ...DEFAULT_LIMITS, max_order_qty: 50 } });

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 100, limitPrice: 190 });
    await ticket.expectLimitWarning(/exceeds your limit/i);
    await ticket.expectSubmitDisabled();
  });
});

adminTest.describe("Admin session", () => {
  adminTest("reaches dashboard", async ({ app }) => {
    await expect(app.page.locator(".flexlayout__tab").first()).toBeVisible();
  });

  adminTest("Mission Control layout visible", async ({ app }) => {
    await expect(
      app.page.locator(".flexlayout__tab_button", { hasText: /Mission Control/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  adminTest("admin name appears in header", async ({ app }) => {
    await expect(app.page.getByText(DEFAULT_ADMIN.name, { exact: false })).toBeVisible({ timeout: 5_000 });
  });
});
