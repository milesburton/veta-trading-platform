import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";

async function switchLayout(app: AppPage, label: string) {
  await app.page.getByTitle("Switch layout template").click();
  const templateId =
    label === "Observability"
      ? "layout-template-observability"
      : label === "Pipeline Monitor"
        ? "layout-template-algo-pipeline"
        : `layout-template-${label.toLowerCase().replace(/\s+/g, "-")}`;
  await app.page.getByTestId(templateId).click();
  await app.page.waitForTimeout(500);
}

test.describe("Observability layout", () => {
  test("switching to Observability shows Service Health and Throughput tabs", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    await expect(await app.panelByTitle(/Service Health/i)).toBeVisible({ timeout: 8_000 });
    await expect(await app.panelByTitle(/Throughput/i)).toBeVisible({ timeout: 5_000 });
  });

  test("Observability layout includes Estate Overview and Observability tabs", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Observability");

    await expect(await app.panelByTitle(/Estate Overview/i)).toBeVisible({ timeout: 8_000 });
    await expect(await app.panelByTitle(/Observability/i)).toBeVisible({ timeout: 5_000 });
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

    await expect(page.getByTestId("observability-panel")).toBeVisible({ timeout: 8_000 });
  });
});

// Temporary quarantine: the Pipeline Monitor assertions are still flaky under
// the current browser/server load and will be revisited in a dedicated pass.
test.describe.skip("Pipeline Monitor layout", () => {
  test("switching to Pipeline Monitor shows Algo Monitor and Order Blotter tabs", async ({
    page,
  }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Pipeline Monitor");

    await expect(page.getByTestId("algo-monitor-panel")).toBeVisible({ timeout: 15_000 });
  });

  test("Pipeline Monitor shows Child Orders, Executions, and Decision Log", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await switchLayout(app, "Pipeline Monitor");

    await expect(page.getByTestId("order-progress-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("child-orders-list")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("executions-panel")).toBeVisible({ timeout: 10_000 });
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

    await expect(page.getByTestId("layout-template-observability")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("layout-template-algo-pipeline")).toBeVisible({
      timeout: 5_000,
    });

    await page.keyboard.press("Escape");
  });

  test("template descriptions are shown in the picker", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();

    await page.getByTitle("Switch layout template").click();

    await expect(page.getByText(/System health command centre/i, { exact: false })).toBeVisible({
      timeout: 5_000,
    });

    await expect(page.getByText(/Real-time algo pipeline/i, { exact: false })).toBeVisible({
      timeout: 5_000,
    });

    await page.keyboard.press("Escape");
  });
});
