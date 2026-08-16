import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@0.217";
import type { FeatureVector } from "../types/intelligence.ts";
import { applyShocks } from "../scenario-engine/apply-shocks.ts";

function fv(overrides: Partial<FeatureVector> = {}): FeatureVector {
  return {
    symbol: "AAPL",
    ts: 1_700_000_000_000,
    momentum: 0.02,
    relativeVolume: 1.1,
    realisedVol: 0.25,
    sectorRelativeStrength: 0.01,
    eventScore: 0,
    newsVelocity: 0,
    sentimentDelta: 0,
    ...overrides,
  };
}

Deno.test("[apply-shocks] a shock to a known factor adds the delta", () => {
  const result = applyShocks(fv({ momentum: 0.02 }), [{ factor: "momentum", delta: 0.01 }]);
  assertEquals(result.momentum, 0.03);
});

Deno.test("[apply-shocks] an empty shocks array leaves the vector unchanged", () => {
  const base = fv();
  const result = applyShocks(base, []);
  assertEquals(result, base);
});

Deno.test("[apply-shocks] multiple shocks to the same factor accumulate", () => {
  const result = applyShocks(fv({ momentum: 0 }), [
    { factor: "momentum", delta: 0.01 },
    { factor: "momentum", delta: 0.02 },
  ]);
  assertEquals(result.momentum, 0.03);
});

Deno.test("[apply-shocks] shocks to different factors are independent", () => {
  const result = applyShocks(fv({ momentum: 0.02, realisedVol: 0.25 }), [
    { factor: "momentum", delta: 0.01 },
    { factor: "realisedVol", delta: -0.05 },
  ]);
  assertEquals(result.momentum, 0.03);
  assertEquals(result.realisedVol, 0.2);
});

Deno.test("[apply-shocks] a negative delta subtracts from the factor", () => {
  const result = applyShocks(fv({ momentum: 0.05 }), [{ factor: "momentum", delta: -0.02 }]);
  assertAlmostEquals(result.momentum, 0.03);
});

Deno.test("[apply-shocks] a zero-delta shock leaves the factor unchanged", () => {
  const result = applyShocks(fv({ momentum: 0.02 }), [{ factor: "momentum", delta: 0 }]);
  assertEquals(result.momentum, 0.02);
});

Deno.test("[apply-shocks] does not mutate the input feature vector", () => {
  const base = fv({ momentum: 0.02 });
  applyShocks(base, [{ factor: "momentum", delta: 0.5 }]);
  assertEquals(base.momentum, 0.02);
});
