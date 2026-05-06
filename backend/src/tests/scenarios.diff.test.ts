import { assertEquals } from "jsr:@std/assert@0.217";
import { diffOutcome } from "../scenarios/diff.ts";
import type { ScenarioActual, ScenarioExpected } from "../scenarios/types.ts";

const baseActual: ScenarioActual = {
  fillCount: 5,
  totalFilled: 1_000,
  avgFillPrice: 190.05,
  avgFillPriceBps: 2.6,
  slippageBps: 1.4,
  childOrderIds: ["c1", "c2", "c3", "c4", "c5"],
  durationMs: 12_000,
};

Deno.test("diff: null expected → matched, no fields", () => {
  const d = diffOutcome(null, baseActual);
  assertEquals(d.matched, true);
  assertEquals(d.fields, {});
});

Deno.test("diff: exact match on all expected fields", () => {
  const expected: ScenarioExpected = {
    fillCount: 5,
    totalFilled: 1_000,
    avgFillPriceBps: 2.6,
    slippageBps: 1.4,
  };
  const d = diffOutcome(expected, baseActual);
  assertEquals(d.matched, true);
  assertEquals(d.fields.fillCount?.withinTolerance, true);
  assertEquals(d.fields.totalFilled?.withinTolerance, true);
});

Deno.test("diff: mismatch outside tolerance is flagged", () => {
  const expected: ScenarioExpected = {
    fillCount: 5,
    totalFilled: 1_000,
    avgFillPriceBps: 1.0,
    slippageBps: 1.4,
    tolerance: { bps: 0.5 },
  };
  const d = diffOutcome(expected, baseActual);
  assertEquals(d.matched, false);
  assertEquals(d.fields.avgFillPriceBps?.withinTolerance, false);
});

Deno.test("diff: mismatch within tolerance still matches", () => {
  const expected: ScenarioExpected = {
    fillCount: 4,
    totalFilled: 1_000,
    tolerance: { fillCount: 1 },
  };
  const d = diffOutcome(expected, baseActual);
  assertEquals(d.matched, true);
  assertEquals(d.fields.fillCount?.withinTolerance, true);
});

Deno.test("diff: only checks fields that are specified in expected", () => {
  const expected: ScenarioExpected = { fillCount: 5 };
  const d = diffOutcome(expected, baseActual);
  assertEquals(Object.keys(d.fields), ["fillCount"]);
});
