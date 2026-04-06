/**
 * Observability & Pipeline Monitor layout E2E tests.
 *
 * Tests cover:
 *   - Switching to the Observability layout shows the expected panels
 *   - Service Health and Throughput panels render within the layout
 *   - Switching to the Pipeline Monitor layout shows algo + execution panels
 *   - LoginPage shows all service categories in PlatformStatus
 */

import { expect, test } from "@playwright/test";
import { DEFAULT_ADMIN, DEFAULT_TRADER, GatewayMock } from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click the Layout button and then a template by its label text (exact label span match). */
async function switchLayout(app: AppPage, label: string) {
  await app.page.getByTitle("Switch layout template").click();
  // Match on the label <span> within the button, not the full accessible name
  // (descriptions may contain words that overlap with other template names)
  await app.page
    .locator("button")
    .filter({ has: app.page.locator("span.font-medium", { hasText: new RegExp(`^[🔒\\s]*${label}$`) }) })
    .first()
    .click();
  // Wait for flexlayout to settle after model reset
  await app.page.waitForTimeout(400);
}

// ── Observability layout ──────────────────────────────────────────────────────

test.describe("Observability layout", () => {
  test("switching to Observability shows Service Health and Throughput tabs", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    // Service Health tab button should be visible
    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Service Health/i }).first()
    ).toBeVisible({ timeout: 8_000 });

    // Throughput tab button should be visible
    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Throughput/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Observability layout includes Estate Overview and Observability tabs", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Estate Overview/i }).first()
    ).toBeVisible({ timeout: 8_000 });

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Observability/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Observability layout does not show order-ticket or market-ladder", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    // These panels should not be present in the observability layout
    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /place trades/i })
    ).not.toBeVisible();
    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Market Ladder/i })
    ).not.toBeVisible();
  });

  test("Observability layout shows Algo Leaderboard and Decision Log", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Algo Leaderboard/i }).first()
    ).toBeVisible({ timeout: 8_000 });

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /algo audit trail/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Pipeline Monitor layout ───────────────────────────────────────────────────

test.describe("Pipeline Monitor layout", () => {
  test("switching to Pipeline Monitor shows Algo Monitor and Order Blotter tabs", async ({
    page,
  }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Pipeline Monitor");

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /strategy status/i }).first()
    ).toBeVisible({ timeout: 8_000 });

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Orders.*active/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Pipeline Monitor shows Child Orders, Executions, and Decision Log", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Pipeline Monitor");

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Child Orders/i }).first()
    ).toBeVisible({ timeout: 8_000 });

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /trade fills/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /algo audit trail/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Pipeline Monitor does not show order-ticket or market-ladder", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Pipeline Monitor");

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /place trades/i })
    ).not.toBeVisible();
    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Market Ladder/i })
    ).not.toBeVisible();
  });
});

// ── LoginPage — PlatformStatus service grid ───────────────────────────────────

test.describe("LoginPage — PlatformStatus service grid", () => {
  async function gotoLoginPage(page: AppPage["page"]) {
    // Stub all API calls with null (catch-all, lowest priority)
    await page.route("/api/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "null" })
    );
    // gateway/ready must return { ready: true } so StartupOverlay dismisses
    await page.route("/api/gateway/ready", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ready: true, services: {} }),
      })
    );
    // 401 on session check → AuthGate shows LoginPage
    await page.route("/api/user-service/sessions/me", (route) =>
      route.fulfill({ status: 401, body: "" })
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible({
      timeout: 10_000,
    });
  }

  test("shows platform-status section with all service categories", async ({ page }) => {
    await gotoLoginPage(page);

    const status = page.getByTestId("platform-status");
    await expect(status).toBeVisible();

    // Category headings
    await expect(status.getByText(/Order Flow/i)).toBeVisible();
    await expect(status.getByText(/Algo Engines/i)).toBeVisible();
    await expect(status.getByText(/Data Services/i)).toBeVisible();
    await expect(status.getByText(/Infrastructure/i)).toBeVisible();
    await expect(status.getByText(/Observability/i)).toBeVisible();
  });

  test("shows key services with their port numbers", async ({ page }) => {
    await gotoLoginPage(page);

    const status = page.getByTestId("platform-status");

    // Core services
    await expect(status.getByText(/Market Sim/i).first()).toBeVisible();
    await expect(status.getByText(/:5000/).first()).toBeVisible();

    // Algo engines
    await expect(status.getByText(/TWAP Algo/i).first()).toBeVisible();

    // Observability
    await expect(status.getByText(/Kafka Relay/i).first()).toBeVisible();
  });

  test("summary label shows 'Checking platform…' while services are loading", async ({ page }) => {
    await gotoLoginPage(page);

    // All health checks return null (simulated by catch-all → status 200, body null)
    // The summary dot initially shows checking state
    await expect(page.getByTestId("platform-status-label")).toHaveText(/Checking platform|Platform/);
  });

  test("Grafana is not shown in the platform status (removed from services)", async ({ page }) => {
    await gotoLoginPage(page);

    const status = page.getByTestId("platform-status");
    await expect(status.getByText(/Grafana Dashboards/i)).not.toBeVisible();
  });
});

// ── Layout template picker includes new entries ───────────────────────────────

test.describe("Layout template picker", () => {
  test("Observability and Pipeline Monitor appear in the layout picker for traders", async ({
    page,
  }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await page.getByTitle("Switch layout template").click();

    await expect(
      page.locator("button").filter({ has: page.locator("span.font-medium", { hasText: /^[🔒\s]*Observability$/ }) }).first()
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("button").filter({ has: page.locator("span.font-medium", { hasText: /^[🔒\s]*Pipeline Monitor$/ }) }).first()
    ).toBeVisible({ timeout: 5_000 });

    // Close picker
    await page.keyboard.press("Escape");
  });

  test("template descriptions are shown in the picker", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await page.getByTitle("Switch layout template").click();

    await expect(
      page.getByText(/System health command centre/i, { exact: false })
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.getByText(/Real-time algo pipeline/i, { exact: false })
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
  });
});
