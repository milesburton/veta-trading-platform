import { expect } from "@playwright/test";
import { algoTest, PRICES } from "./helpers/fixtures.ts";

algoTest.setTimeout(60_000);

const AAPL_PRICE = PRICES.AAPL;

const ALL_STRATEGIES = [
  "LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE",
] as const;

algoTest.describe("Algo order appears in blotter", () => {
  for (const strategy of ALL_STRATEGIES) {
    algoTest(`${strategy}: injected order appears`, async ({ app, gateway }) => {
      const blotter = await app.getOrderBlotter();
      gateway.injectOrder({
        asset: "AAPL", side: "BUY", quantity: 50,
        limitPrice: AAPL_PRICE, strategy, status: "queued",
      });
      await expect(blotter.orderRows()).toHaveCount(1, { timeout: 8_000 });
      await blotter.waitForStatus("queued");
    });
  }
});

algoTest.describe("LIMIT order lifecycle", () => {
  algoTest("BUY: queued → executing → filled", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    const id = gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "queued",
    });
    await blotter.waitForStatus("queued");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 50, limitPrice: AAPL_PRICE, stages: ["submitted", "routed"] });
    await blotter.waitForStatus("executing");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 50, limitPrice: AAPL_PRICE, stages: ["filled"] });
    await blotter.waitForStatus("filled");
  });

  algoTest("SELL: queued → filled", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    const id = gateway.injectOrder({
      asset: "AAPL", side: "SELL", quantity: 30,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "queued",
    });
    await blotter.waitForStatus("queued");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", side: "SELL", quantity: 30, limitPrice: AAPL_PRICE, stages: ["submitted", "routed", "filled"] });
    await blotter.waitForStatus("filled");
  });

  algoTest("gateway rejection → rejected", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    const id = gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "queued",
    });
    gateway.sendOrderRejected(id, "Position limit breached");
    await blotter.waitForStatus("rejected");
  });

  algoTest("bus-level rejection → rejected", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    const id = gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "queued",
    });
    gateway.sendOrderLifecycle(id, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });

  algoTest("expired → expired badge", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    const id = gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "queued",
    });
    gateway.sendOrderLifecycle(id, { stages: ["submitted", "expired"] });
    await blotter.waitForStatus("expired");
  });
});

function strategyLifecycleTests(strategy: string) {
  algoTest(`${strategy} BUY: queued → executing → filled`, async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    const id = gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 100,
      limitPrice: AAPL_PRICE, strategy, status: "queued",
    });
    await blotter.waitForStatus("queued");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE, stages: ["submitted", "routed"] });
    await blotter.waitForStatus("executing");

    gateway.sendOrderLifecycle(id, { asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE, stages: ["filled"] });
    await blotter.waitForStatus("filled");
  });
}

algoTest.describe("TWAP lifecycle", () => strategyLifecycleTests("TWAP"));
algoTest.describe("POV lifecycle", () => strategyLifecycleTests("POV"));
algoTest.describe("VWAP lifecycle", () => strategyLifecycleTests("VWAP"));
algoTest.describe("ICEBERG lifecycle", () => strategyLifecycleTests("ICEBERG"));
algoTest.describe("SNIPER lifecycle", () => strategyLifecycleTests("SNIPER"));
algoTest.describe("ARRIVAL_PRICE lifecycle", () => strategyLifecycleTests("ARRIVAL_PRICE"));

algoTest.describe("Direct status injection", () => {
  algoTest("injected rejected order shows rejected badge", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "rejected",
    });
    await blotter.waitForStatus("rejected");
  });

  algoTest("injected expired order shows expired badge", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "expired",
    });
    await blotter.waitForStatus("expired");
  });

  algoTest("injected filled order shows filled badge", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    gateway.injectOrder({
      asset: "AAPL", side: "BUY", quantity: 50,
      limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "filled",
    });
    await blotter.waitForStatus("filled");
  });
});

algoTest.describe("Multi-strategy blotter", () => {
  algoTest("shows orders from multiple strategies concurrently", async ({ app, gateway }) => {
    const blotter = await app.getOrderBlotter();
    gateway.injectOrder({ asset: "AAPL", side: "BUY", quantity: 50, limitPrice: AAPL_PRICE, strategy: "LIMIT", status: "queued" });
    gateway.injectOrder({ asset: "MSFT", side: "SELL", quantity: 100, limitPrice: 421, strategy: "TWAP", status: "executing" });
    gateway.injectOrder({ asset: "GOOGL", side: "BUY", quantity: 200, limitPrice: 175, strategy: "VWAP", status: "filled" });

    await expect(blotter.orderRows()).toHaveCount(3, { timeout: 8_000 });
  });
});
