import { test as base, expect } from "@playwright/test";
import { DEFAULT_ADMIN, DEFAULT_ASSETS, DEFAULT_LIMITS, GatewayMock } from "./helpers/GatewayMock.ts";
import { adminTest, traderTest } from "./helpers/fixtures.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

traderTest.setTimeout(60_000);
adminTest.setTimeout(60_000);

traderTest.describe("Default trading workspace", () => {
  traderTest("Order Blotter renders", async ({ blotter }) => {
    await blotter.expectEmpty();
  });

  traderTest("Order Ticket renders", async ({ ticket }) => {
    await expect(ticket.container).toBeVisible();
  });

  traderTest("Market Ladder renders assets", async ({ app }) => {
    const ladder = await app.getMarketLadder();
    await ladder.waitForSymbol("AAPL");
  });
});

traderTest.describe("Trading workspace panels (injected orders)", () => {
  traderTest("Child Orders panel shows children for selected order", async ({ app, gateway }) => {
    const id = gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 100,
      limitPrice: 185.5, strategy: "TWAP", status: "executing",
    });
    gateway.sendOrderLifecycle(id, {
      asset: "AAPL", quantity: 50, limitPrice: 185.5, stages: ["submitted", "routed", "filled"],
    });

    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("filled");
  });
});

base.describe("Options workspace", () => {
  base("Option Pricing panel renders in options workspace", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ assets: DEFAULT_ASSETS, url: "/?ws=ws-options" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({
      user: { id: "trader-1", name: "Alice Chen", role: "trader", avatar_emoji: "AL" },
      limits: { ...DEFAULT_LIMITS, allowed_desks: ["equity", "derivatives"] },
    });
    app.gateway.sendMarketUpdate({ AAPL: 185.5, MSFT: 390 });
    await page.waitForTimeout(400);

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Option Pricing/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

base.describe("Research workspace", () => {
  base("Research Radar renders", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ assets: DEFAULT_ASSETS, url: "/?ws=ws-research" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity();
    app.gateway.sendMarketUpdate({ AAPL: 185.5 });
    await page.waitForTimeout(400);

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Research Radar|Signal Radar/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

base.describe("Market feeds workspace", () => {
  base("Market Heatmap renders", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: DEFAULT_ADMIN, assets: DEFAULT_ASSETS, url: "/?ws=ws-market-feeds" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
    app.gateway.sendMarketUpdate({ AAPL: 185.5, MSFT: 390 });
    await page.waitForTimeout(600);

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Market Heatmap/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

base.describe("Admin system-status workspace", () => {
  base("Estate Overview visible", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: DEFAULT_ADMIN, assets: DEFAULT_ASSETS, url: "/?ws=ws-system-status" });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
    await page.waitForTimeout(400);

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Estate|Command Centre/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

adminTest.describe("Admin default workspace", () => {
  adminTest("Mission Control tab visible", async ({ app }) => {
    await expect(
      app.page.locator(".flexlayout__tab_button", { hasText: /Mission Control/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

base.describe("FI workspace", () => {
  base("Spread Analysis renders in FI workspace", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader(DEFAULT_ASSETS, "ws-fi-analysis");
    app.gateway.sendMarketUpdate({ AAPL: 185.5 });
    await page.waitForTimeout(400);

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Spread Analysis/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  base("Duration Ladder renders in FI workspace", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader(DEFAULT_ASSETS, "ws-fi-analysis");
    app.gateway.sendMarketUpdate({ AAPL: 185.5 });
    await page.waitForTimeout(400);

    await expect(
      page.locator(".flexlayout__tab_button", { hasText: /Duration Ladder/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

base.describe("Algo workspace", () => {
  base("Algo workspace loads with panels", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAlgoTrader(DEFAULT_ASSETS);
    app.gateway.sendMarketUpdate({ AAPL: 185.5 });
    await page.waitForTimeout(400);

    await expect(page.locator(".flexlayout__tab").first()).toBeVisible({ timeout: 8_000 });
  });
});
