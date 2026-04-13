import { expect, test } from "@playwright/test";
import { DEFAULT_ASSETS, DEFAULT_LIMITS } from "./helpers/GatewayMock";
import { AppPage } from "./helpers/pages/AppPage";

test.setTimeout(60_000);

const AAPL_PRICE = 185.5;

async function setupTrader(page: import("@playwright/test").Page) {
  const app = new AppPage(page);
  await app.gotoAsTrader();
  app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE, MSFT: 390 });
  await page.waitForTimeout(300);
  return app;
}

async function setupAlgoTrader(page: import("@playwright/test").Page) {
  const app = new AppPage(page);
  await app.goto({
    user: { id: "trader-1", name: "Alice Chen", role: "trader", avatar_emoji: "AL" },
    assets: DEFAULT_ASSETS,
  });
  await app.waitForDashboard();
  app.gateway.sendAuthIdentity({
    limits: {
      ...DEFAULT_LIMITS,
      allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE"],
    },
  });
  app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE, MSFT: 390 });
  await page.waitForTimeout(300);
  return app;
}

test.describe("Equity high-touch workflow", () => {
  test("login → select symbol → place LIMIT order → fill → verify blotter", async ({ page }) => {
    const app = await setupTrader(page);

    const ladder = await app.getMarketLadder();
    await ladder.selectSymbol("AAPL");

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ strategy: "LIMIT", side: "BUY", quantity: 500, limitPrice: AAPL_PRICE });

    const outbound = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    const clientOrderId = msg.payload.clientOrderId as string;

    await ticket.expectSuccessFeedback();

    const blotter = await app.getOrderBlotter();
    await blotter.expectHasOrders();
    await blotter.expectAssetVisible("AAPL");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 500,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed"],
    });
    await blotter.waitForStatus("executing");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 500,
      limitPrice: AAPL_PRICE,
      stages: ["filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("login → place SELL order → fill → verify blotter", async ({ page }) => {
    const app = await setupTrader(page);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ side: "SELL", quantity: 200, limitPrice: AAPL_PRICE });

    const outbound = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 200,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });

    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("filled");
  });
});

test.describe("Algo strategy workflow", () => {
  test("place TWAP order → full lifecycle", async ({ page }) => {
    const app = await setupAlgoTrader(page);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ strategy: "TWAP", side: "BUY", quantity: 5000, limitPrice: AAPL_PRICE });

    const outbound = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    const clientOrderId = msg.payload.clientOrderId as string;

    expect(msg.payload.strategy).toBe("TWAP");

    const blotter = await app.getOrderBlotter();
    await blotter.expectHasOrders();

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 5000,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed"],
    });
    await blotter.waitForStatus("executing");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 5000,
      limitPrice: AAPL_PRICE,
      stages: ["filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("place ICEBERG order → verify strategy", async ({ page }) => {
    const app = await setupAlgoTrader(page);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ strategy: "ICEBERG", side: "BUY", quantity: 5000, limitPrice: AAPL_PRICE });

    const outbound = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;

    expect(msg.payload.strategy).toBe("ICEBERG");
    await ticket.expectSuccessFeedback();
  });
});

test.describe("Risk limit enforcement", () => {
  test("order exceeding max_order_qty shows warning", async ({ page }) => {
    const app = await setupTrader(page);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 50000, limitPrice: AAPL_PRICE });
    await ticket.expectLimitWarning(/exceeds your limit/i);
  });

  test("order exceeding max_daily_notional shows warning", async ({ page }) => {
    const app = await setupTrader(page);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 9000, limitPrice: 200 });
    await ticket.expectLimitWarning(/exceeds your daily limit/i);
  });

  test("gateway rejection appears in blotter as rejected", async ({ page }) => {
    const app = await setupTrader(page);

    const outbound = app.gateway.nextOutbound("submitOrder");
    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["rejected"],
    });

    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("rejected");
  });
});

test.describe("System status indicators", () => {
  test("data depth indicator appears in header", async ({ page }) => {
    const app = await setupTrader(page);
    const depthEl = page.getByTestId("data-depth");
    await expect(depthEl).toBeVisible({ timeout: 5_000 });
    await expect(depthEl).toContainText("sym");
  });

  test("upgrade banner appears when triggered via WS", async ({ page }) => {
    const app = await setupTrader(page);

    await expect(page.getByTestId("upgrade-banner")).not.toBeVisible();

    app.gateway.sendUpgradeStatus(true, "Scheduled maintenance until 18:00 UTC");

    const banner = page.getByTestId("upgrade-banner");
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner).toContainText("Scheduled maintenance");
  });

  test("upgrade banner disappears when upgrade ends", async ({ page }) => {
    const app = await setupTrader(page);

    app.gateway.sendUpgradeStatus(true);
    await expect(page.getByTestId("upgrade-banner")).toBeVisible({ timeout: 5_000 });

    app.gateway.sendUpgradeStatus(false);
    await expect(page.getByTestId("upgrade-banner")).not.toBeVisible({ timeout: 5_000 });
  });

  test("feed status indicator shows live state", async ({ page }) => {
    const app = await setupTrader(page);
    const feed = page.getByTestId("feed-status");
    await expect(feed).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Order expiry", () => {
  test("expired order shows expired status in blotter", async ({ page }) => {
    const app = await setupTrader(page);

    const outbound = app.gateway.nextOutbound("submitOrder");
    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "expired"],
    });

    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("expired");
  });
});
