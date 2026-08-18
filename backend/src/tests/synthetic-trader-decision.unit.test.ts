import { assert, assertEquals, assertThrows } from "jsr:@std/assert@0.217";
import { DecisionEngine } from "../synthetic-trader/decision-engine.ts";
import { PositionTracker } from "../synthetic-trader/position-tracker.ts";

function sequenceRandom(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

Deno.test("[synthetic-trader-decision] rejects an unknown archetype id", () => {
  assertThrows(() => new DecisionEngine({ archetypeId: "not-a-real-archetype", userId: "u1" }));
});

Deno.test("[synthetic-trader-decision] produces an order when everything is available", () => {
  const engine = new DecisionEngine({
    archetypeId: "equity-high-touch",
    userId: "u1",
    symbols: ["AAPL"],
    random: sequenceRandom([0.1, 0.1, 0.1, 0.5]),
  });
  const tracker = new PositionTracker();
  const decision = engine.decide(tracker, () => 200);
  assertEquals(decision.kind, "order");
  if (decision.kind === "order") {
    assertEquals(decision.order.asset, "AAPL");
    assertEquals(decision.order.userId, "u1");
    assert(decision.order.quantity >= 100 && decision.order.quantity <= 2000);
    assert((decision.order.limitPrice ?? 0) > 0);
  }
});

Deno.test("[synthetic-trader-decision] skips when no live price is available", () => {
  const engine = new DecisionEngine({ archetypeId: "equity-high-touch", userId: "u1", symbols: ["AAPL"] });
  const tracker = new PositionTracker();
  const decision = engine.decide(tracker, () => undefined);
  assertEquals(decision.kind, "skip");
});

Deno.test("[synthetic-trader-decision] skips when every candidate symbol has an open opposite-side order", () => {
  const engine = new DecisionEngine({
    archetypeId: "equity-high-touch",
    userId: "u1",
    symbols: ["AAPL"],
    random: sequenceRandom([0]), // side: BUY (random < 0.5)
  });
  const tracker = new PositionTracker();
  tracker.recordAck({ clientOrderId: "x", asset: "AAPL", side: "SELL", quantity: 100, limitPrice: 200 });
  const decision = engine.decide(tracker, () => 200);
  assertEquals(decision.kind, "skip");
});

Deno.test("[synthetic-trader-decision] skips when the open-order cap is reached", () => {
  const engine = new DecisionEngine({ archetypeId: "equity-high-touch", userId: "u1", symbols: ["AAPL"] });
  const tracker = new PositionTracker();
  for (let i = 0; i < 30; i++) {
    tracker.recordAck({ clientOrderId: `o${i}`, asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 200 });
  }
  const decision = engine.decide(tracker, () => 200);
  assertEquals(decision.kind, "skip");
});

Deno.test("[synthetic-trader-decision] only ever selects strategies within the archetype's allowed set", () => {
  const engine = new DecisionEngine({ archetypeId: "fi-voice", userId: "u1", symbols: ["AAPL"] });
  const tracker = new PositionTracker();
  for (let i = 0; i < 20; i++) {
    const decision = engine.decide(tracker, () => 200);
    if (decision.kind === "order") {
      assertEquals(decision.order.strategy, "LIMIT");
    }
  }
});

Deno.test("[synthetic-trader-decision] each archetype's default symbols produce the correct desk and instrumentType", () => {
  const cases: Array<{ archetypeId: string; desk: string; instrumentType: string }> = [
    { archetypeId: "equity-high-touch", desk: "equity", instrumentType: "equity" },
    { archetypeId: "equity-low-touch", desk: "equity", instrumentType: "equity" },
    { archetypeId: "fx-electronic", desk: "fx", instrumentType: "fx" },
    { archetypeId: "fx-high-touch", desk: "fx", instrumentType: "fx" },
    { archetypeId: "fi-voice", desk: "fi", instrumentType: "bond" },
    { archetypeId: "derivatives-high-touch", desk: "derivatives", instrumentType: "option" },
    { archetypeId: "derivatives-low-touch", desk: "derivatives", instrumentType: "option" },
    { archetypeId: "commodities-voice", desk: "commodities", instrumentType: "commodity" },
  ];
  for (const { archetypeId, desk, instrumentType } of cases) {
    const engine = new DecisionEngine({ archetypeId, userId: "u1", random: () => 0.1 });
    const tracker = new PositionTracker();
    const decision = engine.decide(tracker, () => 100);
    assertEquals(decision.kind, "order", `${archetypeId} should produce an order`);
    if (decision.kind === "order") {
      assertEquals(decision.order.desk, desk, `${archetypeId} desk`);
      assertEquals(decision.order.instrumentType, instrumentType, `${archetypeId} instrumentType`);
    }
  }
});

Deno.test("[synthetic-trader-decision] side selection is weighted roughly 50/50 over many samples", () => {
  const engine = new DecisionEngine({ archetypeId: "equity-high-touch", userId: "u1", symbols: ["AAPL", "MSFT"] });
  const tracker = new PositionTracker();
  let buys = 0;
  let sells = 0;
  for (let i = 0; i < 400; i++) {
    const fresh = new PositionTracker();
    const decision = engine.decide(fresh, () => 200);
    if (decision.kind === "order") {
      if (decision.order.side === "BUY") buys++;
      else sells++;
    }
  }
  assert(buys > 0 && sells > 0);
  const ratio = buys / (buys + sells);
  assert(ratio > 0.3 && ratio < 0.7, `expected roughly balanced BUY/SELL, got ratio=${ratio}`);
});
