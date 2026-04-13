import { expect, test } from "@playwright/test";
import { DEFAULT_ADMIN, DEFAULT_TRADER, GatewayMock } from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

async function switchLayout(app: AppPage, label: string) {
  await app.page.getByTitle("Switch layout template").click();
  await app.page
    .locator("button")
    .filter({ has: app.page.locator("span.font-medium", { hasText: new RegExp(`^[🔒\\s]*${label}$`) }) })
    .first()
    .click();
  await app.page.waitForTimeout(400);
}

test.describe("Observability layout", () => {
  test("switching to Observability shows Service Health and Throughput tabs", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Service Health/i }).first()
    ).toBeVisible({ timeout: 8_000 });

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
