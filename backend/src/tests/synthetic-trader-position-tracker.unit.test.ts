import { assertEquals } from "jsr:@std/assert@0.217";
import { PositionTracker } from "../synthetic-trader/positionTracker.ts";

Deno.test("[synthetic-trader-position-tracker] recordAck adds an order to the open set", () => {
  const tracker = new PositionTracker();
  tracker.recordAck({ clientOrderId: "a", asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 200 });
  assertEquals(tracker.openOrderCount(), 1);
});

Deno.test("[synthetic-trader-position-tracker] recordTerminal removes an order from the open set", () => {
  const tracker = new PositionTracker();
  tracker.recordAck({ clientOrderId: "a", asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 200 });
  tracker.recordTerminal("a");
  assertEquals(tracker.openOrderCount(), 0);
});

Deno.test("[synthetic-trader-position-tracker] recordTerminal on unknown id is a no-op", () => {
  const tracker = new PositionTracker();
  tracker.recordTerminal("does-not-exist");
  assertEquals(tracker.openOrderCount(), 0);
});

Deno.test("[synthetic-trader-position-tracker] hasOpenOpposite detects an opposite-side open order on the same asset", () => {
  const tracker = new PositionTracker();
  tracker.recordAck({ clientOrderId: "a", asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 200 });
  assertEquals(tracker.hasOpenOpposite("AAPL", "SELL"), true);
  assertEquals(tracker.hasOpenOpposite("AAPL", "BUY"), false);
  assertEquals(tracker.hasOpenOpposite("MSFT", "SELL"), false);
});

Deno.test("[synthetic-trader-position-tracker] notionalByAsset sums quantity times price per asset", () => {
  const tracker = new PositionTracker();
  tracker.recordAck({ clientOrderId: "a", asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 200 });
  tracker.recordAck({ clientOrderId: "b", asset: "AAPL", side: "BUY", quantity: 50, limitPrice: 200 });
  tracker.recordAck({ clientOrderId: "c", asset: "MSFT", side: "BUY", quantity: 10, limitPrice: 400 });
  const notional = tracker.notionalByAsset();
  assertEquals(notional.get("AAPL"), 30_000);
  assertEquals(notional.get("MSFT"), 4_000);
});

Deno.test("[synthetic-trader-position-tracker] pickLeastConcentrated prefers the asset with the smallest tracked notional", () => {
  const tracker = new PositionTracker();
  tracker.recordAck({ clientOrderId: "a", asset: "AAPL", side: "BUY", quantity: 1000, limitPrice: 200 });
  const picked = tracker.pickLeastConcentrated(["AAPL", "MSFT"]);
  assertEquals(picked, "MSFT");
});

Deno.test("[synthetic-trader-position-tracker] pickLeastConcentrated throws on an empty candidate list", () => {
  const tracker = new PositionTracker();
  let threw = false;
  try {
    tracker.pickLeastConcentrated([]);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
