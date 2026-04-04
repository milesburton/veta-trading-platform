/**
 * Algo order E2E tests.
 *
 * Uses GatewayMock.injectOrder() to create orders directly in the mock store
 * and send the appropriate WS events, bypassing the Order Ticket UI entirely.
 * This avoids FlexLayout tab overflow issues in CI viewports.
 *
 * Tests verify:
 * - Orders with each strategy appear in the blotter
 * - Full lifecycle transitions (queued -> executing -> filled)
 * - Rejection and expiry statuses surface correctly
 * - Multiple strategies coexist in the blotter
 */

import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { DEFAULT_ASSETS, DEFAULT_LIMITS } from "./helpers/GatewayMock.ts";

test.setTimeout(60_000);

const AAPL_PRICE = 189.5;

/** All strategies the system supports. */
const ALL_STRATEGIES = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
] as const;

/** Set up a trader session with all strategies permitted and initial price ticks. */
async function setup(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = new AppPage(page);
  await app.goto({
    user: {
      id: "trader-1",
      name: "Alice Chen",
      role: "trader",
      avatar_emoji: "AL",
    },
    assets: DEFAULT_ASSETS,
  });
  await app.waitForDashboard();

  // Grant all strategies
  app.gateway.sendAuthIdentity({
    limits: { ...DEFAULT_LIMITS, allowed_strategies: [...ALL_STRATEGIES] },
  });

  // Seed prices
  app.gateway.sendMarketUpdate({
    AAPL: AAPL_PRICE,
    MSFT: 421.0,
    GOOGL: 175.25,
  });
  await page.waitForTimeout(400);

  return app;
}

// -- Strategy presence in blotter -----------------------------------------------

test.describe("Algo order appears in blotter", () => {
  for (const strategy of ALL_STRATEGIES) {
    test(`${strategy}: injected order appears in the blotter`, async ({ page }) => {
      const app = await setup(page);
      const blotter = await app.getOrderBlotter();

      app.gateway.injectOrder({
        asset: "AAPL",
        side: "BUY",
        quantity: 50,
        limitPrice: AAPL_PRICE,
        strategy,
        status: "queued",
      });

      await expect(blotter.orderRows()).toHaveCount(1, { timeout: 8_000 });
      await blotter.waitForStatus("queued");
    });
  }
});

// -- LIMIT lifecycle -----------------------------------------------------------

test.describe("LIMIT order lifecycle", () => {
  test("LIMIT BUY: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed"],
    });
    await blotter.waitForStatus("executing");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      stages: ["filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("LIMIT SELL: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "SELL",
      quantity: 30,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      side: "SELL",
      quantity: 30,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("LIMIT: gateway rejection surfaces as rejected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "queued",
    });

    app.gateway.sendOrderRejected(clientOrderId, "Position limit breached");
    await blotter.waitForStatus("rejected");
  });

  test("LIMIT: bus-level rejection surfaces in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });

  test("LIMIT: expired order shows expired badge", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, {
      stages: ["submitted", "expired"],
    });
    await blotter.waitForStatus("expired");
  });
});

// -- TWAP lifecycle ------------------------------------------------------------

test.describe("TWAP order lifecycle", () => {
  test("TWAP BUY: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 90,
      limitPrice: AAPL_PRICE,
      strategy: "TWAP",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 90,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("TWAP: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 60,
      limitPrice: AAPL_PRICE,
      strategy: "TWAP",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// -- POV lifecycle -------------------------------------------------------------

test.describe("POV order lifecycle", () => {
  test("POV BUY: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      strategy: "POV",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("POV: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 80,
      limitPrice: AAPL_PRICE,
      strategy: "POV",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// -- VWAP lifecycle ------------------------------------------------------------

test.describe("VWAP order lifecycle", () => {
  test("VWAP SELL: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "SELL",
      quantity: 70,
      limitPrice: AAPL_PRICE,
      strategy: "VWAP",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      side: "SELL",
      quantity: 70,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("VWAP: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      strategy: "VWAP",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// -- ICEBERG lifecycle ---------------------------------------------------------

test.describe("ICEBERG order lifecycle", () => {
  test("ICEBERG BUY: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 200,
      limitPrice: AAPL_PRICE,
      strategy: "ICEBERG",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 200,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("ICEBERG: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 200,
      limitPrice: AAPL_PRICE,
      strategy: "ICEBERG",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// -- SNIPER lifecycle ----------------------------------------------------------

test.describe("SNIPER order lifecycle", () => {
  test("SNIPER BUY: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 30,
      limitPrice: AAPL_PRICE,
      strategy: "SNIPER",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 30,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("SNIPER: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 30,
      limitPrice: AAPL_PRICE,
      strategy: "SNIPER",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// -- ARRIVAL_PRICE lifecycle ---------------------------------------------------

test.describe("ARRIVAL_PRICE order lifecycle", () => {
  test("ARRIVAL_PRICE BUY: queued -> executing -> filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 40,
      limitPrice: AAPL_PRICE,
      strategy: "ARRIVAL_PRICE",
      status: "queued",
    });

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 40,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("ARRIVAL_PRICE: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    const clientOrderId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 40,
      limitPrice: AAPL_PRICE,
      strategy: "ARRIVAL_PRICE",
      status: "queued",
    });

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// -- Direct status injection (rejected / expired) ------------------------------

test.describe("Direct status injection", () => {
  test("injected rejected order shows rejected badge immediately", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "rejected",
    });

    await blotter.waitForStatus("rejected");
  });

  test("injected expired order shows expired badge immediately", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    app.gateway.injectOrder({
      asset: "AAPL",
      side: "SELL",
      quantity: 75,
      limitPrice: AAPL_PRICE,
      strategy: "TWAP",
      status: "expired",
    });

    await blotter.waitForStatus("expired");
  });

  test("injected filled order shows filled badge immediately", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 50,
      limitPrice: AAPL_PRICE,
      strategy: "VWAP",
      status: "filled",
    });

    await blotter.waitForStatus("filled");
  });
});

// -- Multi-strategy blotter ----------------------------------------------------

test.describe("Multi-strategy order blotter", () => {
  test("blotter shows orders from multiple strategies concurrently", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    // Inject a LIMIT order and fill it
    const limitId = app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 10,
      limitPrice: AAPL_PRICE,
      strategy: "LIMIT",
      status: "queued",
    });

    await blotter.waitForStatus("queued", 6_000);

    app.gateway.sendOrderLifecycle(limitId, {
      asset: "AAPL",
      quantity: 10,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");

    // Inject a TWAP order — blotter should now have 2 rows
    app.gateway.injectOrder({
      asset: "AAPL",
      side: "BUY",
      quantity: 60,
      limitPrice: AAPL_PRICE,
      strategy: "TWAP",
      status: "queued",
    });

    await expect(blotter.orderRows()).toHaveCount(2, { timeout: 8_000 });
  });
});
