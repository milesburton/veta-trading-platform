import { algoTest, expect, PRICES, traderTest } from "./helpers/fixtures";

const AAPL_PRICE = PRICES.AAPL;

traderTest.setTimeout(60_000);
algoTest.setTimeout(60_000);

traderTest.describe("Equity high-touch workflow", () => {
  traderTest(
    "select symbol → place LIMIT BUY → fill → verify in blotter",
    async ({ app, gateway }) => {
      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");
      await ladder.selectSymbol("AAPL");

      const ticket = await app.getOrderTicket();
      await ticket.fillOrder({ strategy: "LIMIT", side: "BUY", quantity: 500, limitPrice: AAPL_PRICE });

      const outbound = gateway.nextOutbound("submitOrder");
      await ticket.submit();
      const msg = await outbound;
      const id = msg.payload.clientOrderId as string;

      await ticket.expectSuccessFeedback();

      const blotter = await app.getOrderBlotter();
      await blotter.expectHasOrders();
      await blotter.expectAssetVisible("AAPL");

      gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 500, limitPrice: AAPL_PRICE, stages: ["submitted", "routed"] });
      await blotter.waitForStatus("executing");

      gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 500, limitPrice: AAPL_PRICE, stages: ["filled"] });
      await blotter.waitForStatus("filled");
    }
  );

  traderTest("place SELL → full lifecycle", async ({ ticket, blotter, gateway }) => {
    await ticket.fillOrder({ side: "SELL", quantity: 200, limitPrice: AAPL_PRICE });

    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    gateway.sendOrderLifecycle(id, {
      asset: "AAPL", quantity: 200, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });
});

algoTest.describe("Algo strategy workflow", () => {
  algoTest("place TWAP → full lifecycle", async ({ ticket, blotter, gateway }) => {
    await ticket.fillOrder({ strategy: "TWAP", side: "BUY", quantity: 5000, limitPrice: AAPL_PRICE });

    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    expect(msg.payload.strategy).toBe("TWAP");
    await blotter.expectHasOrders();

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 5000, limitPrice: AAPL_PRICE, stages: ["submitted", "routed"] });
    await blotter.waitForStatus("executing");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 5000, limitPrice: AAPL_PRICE, stages: ["filled"] });
    await blotter.waitForStatus("filled");
  });

  algoTest("place ICEBERG → verify strategy", async ({ ticket, gateway }) => {
    await ticket.fillOrder({ strategy: "ICEBERG", side: "BUY", quantity: 5000, limitPrice: AAPL_PRICE });

    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.submit();
    const msg = await outbound;

    expect(msg.payload.strategy).toBe("ICEBERG");
    await ticket.expectSuccessFeedback();
  });
});

traderTest.describe("Risk limit enforcement", () => {
  traderTest("quantity exceeding max shows warning", async ({ ticket }) => {
    await ticket.fillOrder({ quantity: 50000, limitPrice: AAPL_PRICE });
    await ticket.expectLimitWarning(/exceeds your limit/i);
  });

  traderTest("notional exceeding max shows warning", async ({ ticket }) => {
    await ticket.fillOrder({ quantity: 9000, limitPrice: 200 });
    await ticket.expectLimitWarning(/exceeds your daily limit/i);
  });

  traderTest("gateway rejection → rejected in blotter", async ({ ticket, blotter, gateway }) => {
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE, stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

traderTest.describe("System status", () => {
  traderTest("data depth indicator visible", async ({ app }) => {
    const el = app.page.getByTestId("data-depth");
    await expect(el).toBeVisible({ timeout: 5_000 });
    await expect(el).toContainText("sym");
  });

  traderTest("upgrade banner appears and disappears via WS", async ({ app, gateway }) => {
    await expect(app.page.getByTestId("upgrade-banner")).not.toBeVisible();

    gateway.sendUpgradeStatus(true, "Scheduled maintenance");
    await expect(app.page.getByTestId("upgrade-banner")).toBeVisible({ timeout: 5_000 });

    gateway.sendUpgradeStatus(false);
    await expect(app.page.getByTestId("upgrade-banner")).not.toBeVisible({ timeout: 5_000 });
  });

  traderTest("feed status indicator visible", async ({ app }) => {
    await expect(app.page.getByTestId("feed-status")).toBeVisible({ timeout: 5_000 });
  });
});

traderTest.describe("Order expiry", () => {
  traderTest("expired order shows expired status", async ({ ticket, blotter, gateway }) => {
    const outbound = gateway.nextOutbound("submitOrder");
    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await ticket.submit();
    const msg = await outbound;
    const id = msg.payload.clientOrderId as string;

    gateway.sendOrderLifecycle(id, {
      asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "expired"],
    });
    await blotter.waitForStatus("expired");
  });
});
