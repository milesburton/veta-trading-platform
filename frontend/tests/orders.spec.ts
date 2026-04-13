import { test as base, expect } from "@playwright/test";
import { DEFAULT_LIMITS, GatewayMock } from "./helpers/GatewayMock.ts";
import { traderTest } from "./helpers/fixtures.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";
import type { OrderTicketPage } from "./helpers/pages/OrderTicketPage.ts";

const AAPL_PRICE = 189.5;

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

interface OptionsFixtures {
  app: AppPage;
  gateway: GatewayMock;
  ticket: OrderTicketPage;
}

const optionsTest = base.extend<OptionsFixtures>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();
    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE, MSFT: 421.0, GOOGL: 175.25 });
    await page.waitForSelector('[data-testid="app-header"]', { timeout: 10_000 });
    await use(app);
  },
  gateway: async ({ app }, use) => {
    await use(app.gateway);
  },
  ticket: async ({ app, page }, use) => {
    await page.route("/api/gateway/analytics/quote", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_QUOTE_RESPONSE),
      })
    );
    const ticket = await app.getOrderTicket();
    await ticket.switchToOptions();
    await use(ticket);
  },
});

optionsTest.describe("Option order ticket", () => {
  optionsTest("shows CALL/PUT buttons, strike input, and expiry selector", async ({ ticket }) => {
    await expect(ticket.locator.getByRole("button", { name: "CALL" })).toBeVisible();
    await expect(ticket.locator.getByRole("button", { name: "PUT" })).toBeVisible();
    await expect(ticket.locator.getByLabel(/Option strike price/i)).toBeVisible();
    await expect(ticket.locator.getByLabel(/Option expiry/i)).toBeVisible();
  });

  optionsTest("hides equity-only fields", async ({ ticket }) => {
    await expect(ticket.locator.getByLabel(/Limit Price/i)).not.toBeVisible();
    await expect(ticket.locator.getByLabel(/Order duration/i)).not.toBeVisible();
    await expect(ticket.locator.getByLabel(/Execution strategy/i)).not.toBeVisible();
  });

  optionsTest("CALL is pressed by default", async ({ ticket }) => {
    await ticket.expectCallPressed(true);
  });

  optionsTest("shows algo strategies notice", async ({ ticket }) => {
    await expect(
      ticket.locator.getByText(/Algorithmic strategies are not available for options/i)
    ).toBeVisible();
  });

  optionsTest("premium card appears after entering valid strike", async ({ ticket }) => {
    await ticket.enterStrikeAndWaitForQuote(190);
    await ticket.expectPremiumCard();
  });

  optionsTest("submit enabled after quote loads", async ({ ticket }) => {
    await ticket.enterStrikeAndWaitForQuote(190);
    await ticket.expectOptionSubmitEnabled();
  });

  optionsTest("submission sends WS message with instrumentType=option", async ({ ticket, gateway }) => {
    await ticket.enterStrikeAndWaitForQuote(190);
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submitOption();
    const msg = await outbound;
    expect(msg.payload.instrumentType).toBe("option");
    expect((msg.payload.optionSpec as Record<string, unknown>).optionType).toBe("call");
    expect((msg.payload.optionSpec as Record<string, unknown>).strike).toBe(190);
  });

  optionsTest("shows rejection feedback after submission", async ({ ticket }) => {
    await ticket.enterStrikeAndWaitForQuote(190);
    await ticket.submitOption();
    await ticket.expectOptionRejectionFeedback();
  });

  optionsTest("switching to Equity restores equity-only fields", async ({ ticket }) => {
    await ticket.switchToEquity();
    await expect(ticket.locator.getByLabel(/Limit Price/i)).toBeVisible();
    await expect(ticket.locator.getByLabel(/Option strike price/i)).not.toBeVisible();
  });
});

traderTest.describe("Equity strategy restrictions", () => {
  traderTest("ICEBERG is disabled", async ({ ticket }) => {
    await ticket.expectStrategyOptionDisabled(/ICEBERG/i);
  });

  traderTest("SNIPER is disabled", async ({ ticket }) => {
    await ticket.expectStrategyOptionDisabled(/SNIPER/i);
  });

  traderTest("ARRIVAL PRICE is disabled", async ({ ticket }) => {
    await ticket.expectStrategyOptionDisabled(/ARRIVAL PRICE/i);
  });
});

traderTest.describe("Order submission", () => {
  traderTest("sends submitOrder WS message with correct fields", async ({ ticket, gateway }) => {
    await ticket.fillOrder({ side: "BUY", quantity: 100, limitPrice: AAPL_PRICE });
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    expect(msg.payload.asset).toBe("AAPL");
    expect(msg.payload.side).toBe("BUY");
    expect(msg.payload.quantity).toBe(100);
    expect(msg.payload.limitPrice).toBeCloseTo(AAPL_PRICE, 1);
  });

  traderTest("SELL sends side=SELL", async ({ ticket, gateway }) => {
    await ticket.fillOrder({ side: "SELL", quantity: 50, limitPrice: AAPL_PRICE });
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    expect(msg.payload.side).toBe("SELL");
    expect(msg.payload.quantity).toBe(50);
  });

  traderTest("shows success feedback", async ({ ticket, gateway }) => {
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submit();
    await outbound;
    await ticket.expectSuccessFeedback();
  });

  traderTest("order appears in blotter immediately (optimistic)", async ({ app, ticket }) => {
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const blotter = await app.getOrderBlotter();
    await blotter.expectHasOrders();
    await blotter.expectAssetVisible("AAPL");
  });

  traderTest("queued → executing → filled via WS events", async ({ app, ticket, gateway }) => {
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("queued");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE, stages: ["submitted", "routed"] });
    await blotter.waitForStatus("executing");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE, stages: ["filled"] });
    await blotter.waitForStatus("filled");
  });

  traderTest("gateway rejection → rejected in blotter", async ({ app, ticket, gateway }) => {
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    gateway.sendOrderRejected(id, "Unauthenticated — please log in again");
    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("rejected");
  });

  traderTest("bus-level rejection → rejected in blotter", async ({ app, ticket, gateway }) => {
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    gateway.sendOrderLifecycle(id, { stages: ["rejected"] });
    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("rejected");
  });

  traderTest("expired event → expired in blotter", async ({ app, ticket, gateway }) => {
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    gateway.sendOrderLifecycle(id, { stages: ["submitted", "expired"] });
    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("expired");
  });

  traderTest("blotter shows correct order count", async ({ app, ticket, gateway }) => {
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();

    const blotter = await app.getOrderBlotter();
    await blotter.waitForStatus("queued");

    const ticket2 = await app.getOrderTicket();
    await ticket2.fillOrder({ quantity: 50, limitPrice: AAPL_PRICE });
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket2.submit();
    await outbound;

    await expect(blotter.orderRows()).toHaveCount(2, { timeout: 8_000 });
  });

  traderTest("blotter empty state before first order", async ({ app }) => {
    const blotter = await app.getOrderBlotter();
    await blotter.expectEmpty();
  });
});

base.describe("Risk limit warnings", () => {
  base("quantity exceeding max_order_qty shows warning and disables submit", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: { id: "t1", name: "Trader", role: "trader", avatar_emoji: "T" } });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ limits: { ...DEFAULT_LIMITS, max_order_qty: 50 } });
    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.expectLimitWarning(/exceeds your limit/i);
    await ticket.expectSubmitDisabled();
  });

  base("notional exceeding max_daily_notional shows warning and disables submit", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: { id: "t1", name: "Trader", role: "trader", avatar_emoji: "T" } });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({ limits: { ...DEFAULT_LIMITS, max_daily_notional: 1_000 } });
    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    const ticket = await app.getOrderTicket();
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.expectLimitWarning(/exceeds your daily limit/i);
    await ticket.expectSubmitDisabled();
  });
});
