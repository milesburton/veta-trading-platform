import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { DEFAULT_ASSETS, DEFAULT_LIMITS } from "./helpers/GatewayMock.ts";

const AAPL_PRICE = 189.50;

async function setupWithPrice(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);

  app.gateway.sendMarketUpdate({
    AAPL: AAPL_PRICE,
    MSFT: 421.00,
    GOOGL: 175.25,
  });
  await page.waitForTimeout(400);

  return app;
}

const MOCK_QUOTE_RESPONSE = {
  symbol: "AAPL",
  optionType: "call",
  strike: 190,
  expirySecs: 30 * 86400,
  spotPrice: AAPL_PRICE,
  impliedVol: 0.28,
  price: 4.23,
  greeks: { delta: 0.42, gamma: 0.03, theta: -0.08, vega: 0.12, rho: 0.05 },
  computedAt: Date.now(),
};

async function setupOptionsMode(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = await setupWithPrice(page);

  await page.route("/api/gateway/analytics/quote", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_QUOTE_RESPONSE),
    });
  });

  const ticket = await app.getOrderTicket();
  await ticket.switchToOptions();
  return { app, ticket };
}

test.describe("Option order ticket", () => {
  test("Options tab shows CALL/PUT buttons, strike input, and expiry selector", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await expect(ticket.locator.getByRole("button", { name: "CALL" }))
      .toBeVisible();
    await expect(ticket.locator.getByRole("button", { name: "PUT" }))
      .toBeVisible();
    await expect(ticket.locator.getByLabel(/Option strike price/i))
      .toBeVisible();
    await expect(ticket.locator.getByLabel(/Option expiry/i)).toBeVisible();
  });

  test("Options tab hides equity-only fields", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await expect(ticket.locator.getByLabel(/Limit Price/i)).not.toBeVisible();
    await expect(ticket.locator.getByLabel(/Order duration/i)).not
      .toBeVisible();
    await expect(ticket.locator.getByLabel(/Execution strategy/i)).not
      .toBeVisible();
  });

  test("CALL is pressed by default in options mode", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await ticket.expectCallPressed(true);
  });

  test("algo strategies notice is shown in options mode", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await expect(
      ticket.locator.getByText(
        /Algorithmic strategies are not available for options/i,
      ),
    ).toBeVisible();
  });

  test("premium card appears after entering a valid strike", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await ticket.enterStrikeAndWaitForQuote(190);
    await ticket.expectPremiumCard();
  });

  test("submit button becomes enabled after quote loads", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await ticket.enterStrikeAndWaitForQuote(190);
    await ticket.expectOptionSubmitEnabled();
  });

  test("option order submission sends submitOrder WS message with instrumentType=option", async ({ page }) => {
    const { app, ticket } = await setupOptionsMode(page);
    await ticket.enterStrikeAndWaitForQuote(190);

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submitOption();
    const msg = await outboundPromise;

    expect(msg.payload.instrumentType).toBe("option");
    expect((msg.payload.optionSpec as Record<string, unknown>).optionType).toBe(
      "call",
    );
    expect((msg.payload.optionSpec as Record<string, unknown>).strike).toBe(
      190,
    );
  });

  test("option order shows rejection feedback after submission", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await ticket.enterStrikeAndWaitForQuote(190);
    await ticket.submitOption();
    await ticket.expectOptionRejectionFeedback();
  });

  test("switching back to Equity restores equity-only fields", async ({ page }) => {
    const { ticket } = await setupOptionsMode(page);
    await ticket.switchToEquity();
    await expect(ticket.locator.getByLabel(/Limit Price/i)).toBeVisible();
    await expect(ticket.locator.getByLabel(/Option strike price/i)).not
      .toBeVisible();
  });
});

test.describe("Equity mode stub strategies", () => {
  test("ICEBERG appears as a disabled option in the strategy selector", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();
    await ticket.expectStrategyOptionDisabled(/ICEBERG/i);
  });

  test("SNIPER appears as a disabled option in the strategy selector", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();
    await ticket.expectStrategyOptionDisabled(/SNIPER/i);
  });

  test("ARRIVAL PRICE appears as a disabled option in the strategy selector", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();
    await ticket.expectStrategyOptionDisabled(/ARRIVAL PRICE/i);
  });
});

test.describe("Order submission", () => {
  test("submitting an order sends a submitOrder WS message with correct fields", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();

    await ticket.fillOrder({
      side: "BUY",
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();

    const msg = await outboundPromise;
    expect(msg.payload.asset).toBe("AAPL");
    expect(msg.payload.side).toBe("BUY");
    expect(msg.payload.quantity).toBe(100);
    expect(msg.payload.limitPrice).toBeCloseTo(AAPL_PRICE, 1);
  });

  test("SELL order sends side=SELL in the WS message", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();

    await ticket.fillOrder({
      side: "SELL",
      quantity: 50,
      limitPrice: AAPL_PRICE,
    });

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();

    const msg = await outboundPromise;
    expect(msg.payload.side).toBe("SELL");
    expect(msg.payload.quantity).toBe(50);
  });

  test("submit shows success feedback message", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();

    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();
    await outboundPromise;

    await ticket.expectSuccessFeedback();
  });

  test("order appears in blotter immediately after submission (optimistic)", async ({ page }) => {
    const app = await setupWithPrice(page);

    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).submit();

    const blotter = await app.getOrderBlotter();
    await blotter.expectHasOrders();
    await blotter.expectAssetVisible("AAPL");
  });

  test("order transitions queued → executing → filled via WS events", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed"],
    });
    await blotter.waitForStatus("executing");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("gateway orderRejected event marks order as rejected in blotter", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderRejected(
      clientOrderId,
      "Unauthenticated — please log in again",
    );
    await blotter.waitForStatus("rejected");
  });

  test("bus-level orders.rejected event marks order as rejected", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderLifecycle(clientOrderId, {
      stages: ["rejected"],
    });
    await blotter.waitForStatus("rejected");
  });

  test("orders.expired event marks order as expired", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderLifecycle(clientOrderId, {
      stages: ["submitted", "expired"],
    });
    await blotter.waitForStatus("expired");
  });

  test("blotter shows correct order count from server total", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();
    const blotter = await app.getOrderBlotter();

    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    await blotter.waitForStatus("queued");

    const ticket2 = await app.getOrderTicket();
    await ticket2.fillOrder({ quantity: 50, limitPrice: AAPL_PRICE });
    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket2.submit();
    await outboundPromise;

    await expect(blotter.orderRows()).toHaveCount(2, { timeout: 8_000 });
  });

  test("blotter empty state appears before first order is submitted", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();
    await blotter.expectEmpty();
  });

  test("quantity exceeding max_order_qty shows warning and disables submit", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({
      user: { id: "t1", name: "Trader", role: "trader", avatar_emoji: "T" },
    });
    await app.waitForDashboard();

    app.gateway.sendAuthIdentity({
      limits: { ...DEFAULT_LIMITS, max_order_qty: 50 },
    });

    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).expectLimitWarning(
      /exceeds your limit/i,
    );
    await (await app.getOrderTicket()).expectSubmitDisabled();
  });

  test("notional exceeding max_daily_notional shows warning and disables submit", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({
      user: { id: "t1", name: "Trader", role: "trader", avatar_emoji: "T" },
    });
    await app.waitForDashboard();

    app.gateway.sendAuthIdentity({
      limits: { ...DEFAULT_LIMITS, max_daily_notional: 1_000 },
    });

    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    await (await app.getOrderTicket()).fillOrder({
      quantity: 100,
      limitPrice: AAPL_PRICE,
    });
    await (await app.getOrderTicket()).expectLimitWarning(
      /exceeds your daily limit/i,
    );
    await (await app.getOrderTicket()).expectSubmitDisabled();
  });
});
