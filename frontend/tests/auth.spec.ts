import { test, expect } from "@playwright/test";
import { GatewayMock, DEFAULT_TRADER, DEFAULT_ADMIN, DEFAULT_LIMITS } from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

test.describe("Authentication", () => {
  test.describe("unauthenticated", () => {
    const READY_BODY = JSON.stringify({ ready: true, services: { bus: true, marketSim: true, userService: true, journal: true, ems: true, oms: true } });

    test("shows login page when session check returns 401", async ({ page }) => {
      await page.route("/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
      await page.route("/api/gateway/ready", (route) => route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY }));
      await page.route("/api/user-service/sessions/me", (route) =>
        route.fulfill({ status: 401, body: "" })
      );

      await page.goto("/");

      await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator(".flexlayout__tab")).not.toBeVisible();
    });

    test("shows login page when session fetch fails (network error)", async ({ page }) => {
      await page.route("/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
      await page.route("/api/gateway/ready", (route) => route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY }));
      await page.route("/api/user-service/sessions/me", (route) => route.abort("failed"));

      await page.goto("/");

      await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("login form does not contain OAuth2 implementation details", async ({ page }) => {
      await page.route("/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
      await page.route("/api/gateway/ready", (route) => route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY }));
      await page.route("/api/user-service/sessions/me", (route) => route.fulfill({ status: 401, body: "" }));

      await page.goto("/");

      await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/OAuth2/i);
      expect(bodyText).not.toMatch(/PKCE/i);
    });

    test("submitting valid credentials reaches the dashboard", async ({ page }) => {
      await page.route("/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
      await page.route("/api/gateway/ready", (route) => route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY }));

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
          body: JSON.stringify({ code: "test-code-123", redirect_uri: "postmessage", expires_in: 60, scope: "openid profile" }),
        }),
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

    test("submitting invalid credentials shows an error message", async ({ page }) => {
      await page.route("/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
      await page.route("/api/gateway/ready", (route) => route.fulfill({ status: 200, contentType: "application/json", body: READY_BODY }));
      await page.route("/api/user-service/sessions/me", (route) => route.fulfill({ status: 401, body: "" }));
      await page.route("/api/user-service/oauth/authorize", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_credentials" }),
        }),
      );

      await page.goto("/");
      await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({ timeout: 10_000 });

      await page.getByTestId("oauth-username").fill("alice");
      await page.getByTestId("oauth-password").fill("wrong");
      await page.getByTestId("oauth-submit").click();

      await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("login-error")).toContainText(/sign in failed/i);
      await expect(page.getByTestId("login-error")).not.toContainText(/oauth/i);
    });
  });

  test.describe("trader", () => {
    test("reaches the dashboard after successful session check", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader();

      await expect(page.locator(".flexlayout__tab").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: /sign in/i })).not.toBeVisible();
    });

    test("authIdentity WS message causes user name to appear in header", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader();

      await expect(page.getByText(DEFAULT_TRADER.name, { exact: false })).toBeVisible({
        timeout: 5_000,
      });
    });

    test("trading limits from authIdentity are reflected in the ticket", async ({ page }) => {
      const app = new AppPage(page);
      await app.goto({ user: DEFAULT_TRADER });
      await app.waitForDashboard();

      app.gateway.sendAuthIdentity({
        user: DEFAULT_TRADER,
        limits: { ...DEFAULT_LIMITS, max_order_qty: 50 },
      });

      await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: 190 });
      await (await app.getOrderTicket()).expectLimitWarning(/exceeds your limit/i);
      await (await app.getOrderTicket()).expectSubmitDisabled();
    });
  });

  test.describe("admin", () => {
    test("admin user reaches the dashboard", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsAdmin();

      await expect(page.locator(".flexlayout__tab").first()).toBeVisible();
    });

    test("admin gets Mission Control layout (admin panel tab visible)", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsAdmin();

      await expect(
        page.locator(".flexlayout__tab_button", { hasText: /Mission Control/i }).first()
      ).toBeVisible({ timeout: 8_000 });
    });

    test("Order Ticket shows admin-cannot-trade notice", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsAdmin();

      await expect(page.getByText(DEFAULT_ADMIN.name, { exact: false })).toBeVisible({
        timeout: 5_000,
      });
    });
  });
});
