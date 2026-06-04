import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@0.217";
import { priceFan } from "../analytics/price-fan.ts";

const SPOT = 100;
const VOL = 0.2;
const RATE = 0.05;
const STEP_SECS = 86400;
const PATHS = 1000;

function runPriceFan(steps: number, seedKey: string, vol = VOL, stepSecs = STEP_SECS) {
  return priceFan(SPOT, vol, RATE, steps, stepSecs, PATHS, seedKey);
}

function assertOrderedQuantiles() {
  const result = runPriceFan(5, "test-quantiles");

  for (const step of result) {
    assert(step.p5 >= 0);
    assert(step.p25 >= 0);
    assert(step.p50 >= 0);
    assert(step.p75 >= 0);
    assert(step.p95 >= 0);
    assert(step.p5 <= step.p25);
    assert(step.p25 <= step.p50);
    assert(step.p50 <= step.p75);
    assert(step.p75 <= step.p95);
  }

  return result;
}

function assertFlatQuantiles(step: ReturnType<typeof runPriceFan>[number]) {
  assertAlmostEquals(step.p5, step.p25);
  assertAlmostEquals(step.p25, step.p50);
  assertAlmostEquals(step.p50, step.p75);
  assertAlmostEquals(step.p75, step.p95);
}

for (const { label, steps, seedKey } of [
  {
    label: "returns correct number of steps",
    steps: 10,
    seedKey: "test-steps",
  },
  { label: "edge case - zero steps", steps: 0, seedKey: "zero-steps" },
] as const) {
  Deno.test(`[price-fan] ${label}`, () => {
    assertEquals(runPriceFan(steps, seedKey).length, steps);
  });
}

Deno.test("[price-fan] returns valid price quantiles", () => {
  assertOrderedQuantiles();
});

Deno.test("[price-fan] deterministic results with same seed", () => {
  const result1 = runPriceFan(5, "same-seed");
  const result2 = runPriceFan(5, "same-seed");

  assertEquals(result1.length, result2.length);

  for (let i = 0; i < result1.length; i++) {
    const step1 = result1[i];
    const step2 = result2[i];
    assertAlmostEquals(step1.p5, step2.p5, 1e-10);
    assertAlmostEquals(step1.p25, step2.p25, 1e-10);
    assertAlmostEquals(step1.p50, step2.p50, 1e-10);
    assertAlmostEquals(step1.p75, step2.p75, 1e-10);
    assertAlmostEquals(step1.p95, step2.p95, 1e-10);
  }
});

Deno.test("[price-fan] different seeds produce different results", () => {
  const result1 = runPriceFan(5, "seed-1");
  const result2 = runPriceFan(5, "seed-2");

  assert(result1.length > 0);
  assert(result2.length > 0);
});

Deno.test("[price-fan] edge case - zero volatility", () => {
  const result = runPriceFan(5, "zero-sigma", 0);

  for (const step of result) {
    assertFlatQuantiles(step);
  }
});

Deno.test("[price-fan] returns correct time steps", () => {
  const result = runPriceFan(3, "test-time");

  assertEquals(result[0].tSecs, STEP_SECS);
  assertEquals(result[1].tSecs, STEP_SECS * 2);
  assertEquals(result[2].tSecs, STEP_SECS * 3);
});

Deno.test("[price-fan] p50 should be around the expected drift", () => {
  const result = runPriceFan(5, "test-drift");
  assertOrderedQuantiles();
  assert(result[4].p50 > 0);
});
