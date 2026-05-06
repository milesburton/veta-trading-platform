import { assertEquals } from "jsr:@std/assert@0.217";
import { computeActual, type OutcomeOrder } from "../scenarios/outcome.ts";

function buy(limitPrice: number, fills: Array<{ filled: number; price: number }>): OutcomeOrder {
  return {
    side: "BUY",
    limitPrice,
    children: fills.map((f, i) => ({
      id: `c${i + 1}`,
      status: "filled",
      filled: f.filled,
      avgFillPrice: f.price,
    })),
  };
}

Deno.test("outcome: empty fills produce zeros", () => {
  const a = computeActual({ side: "BUY", limitPrice: 100, children: [] }, 1000, 1500);
  assertEquals(a.fillCount, 0);
  assertEquals(a.totalFilled, 0);
  assertEquals(a.avgFillPrice, 0);
  assertEquals(a.durationMs, 500);
});

Deno.test("outcome: single fill at limit produces zero slippage", () => {
  const order = buy(190, [{ filled: 100, price: 190 }]);
  const a = computeActual(order, 0, 1000);
  assertEquals(a.fillCount, 1);
  assertEquals(a.totalFilled, 100);
  assertEquals(a.avgFillPrice, 190);
  assertEquals(a.avgFillPriceBps, 0);
  assertEquals(a.slippageBps, 0);
});

Deno.test("outcome: BUY fill above limit reports positive slippage", () => {
  const order = buy(100, [{ filled: 50, price: 100.5 }]);
  const a = computeActual(order, 0, 100);
  assertEquals(a.avgFillPriceBps, 50);
  assertEquals(a.slippageBps, 50);
});

Deno.test("outcome: BUY fill below limit shows negative price impact, zero slippage", () => {
  const order = buy(100, [{ filled: 50, price: 99 }]);
  const a = computeActual(order, 0, 100);
  assertEquals(a.avgFillPriceBps, -100);
  assertEquals(a.slippageBps, 0);
});

Deno.test("outcome: SELL fill below limit reports positive slippage", () => {
  const order: OutcomeOrder = {
    side: "SELL",
    limitPrice: 100,
    children: [{ id: "c1", status: "filled", filled: 100, avgFillPrice: 99 }],
  };
  const a = computeActual(order, 0, 100);
  assertEquals(a.avgFillPriceBps, -100);
  assertEquals(a.slippageBps, 100);
});

Deno.test("outcome: ignores non-filled children", () => {
  const order: OutcomeOrder = {
    side: "BUY",
    limitPrice: 100,
    children: [
      { id: "c1", status: "filled", filled: 50, avgFillPrice: 100 },
      { id: "c2", status: "expired", filled: 0 },
      { id: "c3", status: "rejected", filled: 0 },
    ],
  };
  const a = computeActual(order, 0, 100);
  assertEquals(a.fillCount, 1);
  assertEquals(a.totalFilled, 50);
  assertEquals(a.childOrderIds, ["c1"]);
});

Deno.test("outcome: weighted avg across multiple fills", () => {
  const order = buy(100, [
    { filled: 100, price: 100 },
    { filled: 100, price: 102 },
  ]);
  const a = computeActual(order, 0, 100);
  assertEquals(a.totalFilled, 200);
  assertEquals(a.avgFillPrice, 101);
  assertEquals(a.avgFillPriceBps, 100);
});
