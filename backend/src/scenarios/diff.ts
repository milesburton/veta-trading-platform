import type { ScenarioActual, ScenarioDiff, ScenarioExpected } from "./types.ts";

export function diffOutcome(
  expected: ScenarioExpected | null,
  actual: ScenarioActual,
): ScenarioDiff {
  if (!expected) return { matched: true, fields: {} };

  const fields: ScenarioDiff["fields"] = {};
  let matched = true;
  const tol = expected.tolerance ?? {};

  if (expected.fillCount !== undefined) {
    const within = Math.abs(actual.fillCount - expected.fillCount) <= (tol.fillCount ?? 0);
    fields.fillCount = { expected: expected.fillCount, actual: actual.fillCount, withinTolerance: within };
    if (!within) matched = false;
  }
  if (expected.totalFilled !== undefined) {
    const within = Math.abs(actual.totalFilled - expected.totalFilled) <= (tol.totalFilled ?? 0);
    fields.totalFilled = { expected: expected.totalFilled, actual: actual.totalFilled, withinTolerance: within };
    if (!within) matched = false;
  }
  if (expected.avgFillPriceBps !== undefined) {
    const within = Math.abs(actual.avgFillPriceBps - expected.avgFillPriceBps) <= (tol.bps ?? 0);
    fields.avgFillPriceBps = {
      expected: expected.avgFillPriceBps,
      actual: actual.avgFillPriceBps,
      withinTolerance: within,
    };
    if (!within) matched = false;
  }
  if (expected.slippageBps !== undefined) {
    const within = Math.abs(actual.slippageBps - expected.slippageBps) <= (tol.bps ?? 0);
    fields.slippageBps = {
      expected: expected.slippageBps,
      actual: actual.slippageBps,
      withinTolerance: within,
    };
    if (!within) matched = false;
  }

  return { matched, fields };
}
