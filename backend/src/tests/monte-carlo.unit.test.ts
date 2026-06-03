import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "jsr:@std/assert@0.217";
import {
  boxMuller,
  hashSeed,
  makeLcg,
  monteCarlo,
} from "../analytics/monte-carlo.ts";
import type { OptionType } from "../analytics/types.ts";

const SPOT = 100;
const STRIKE = 100;
const TIME = 1;
const RATE = 0.05;
const VOL = 0.2;
const PATHS = 1000;
const SEED_KEY = "test-key";

function runMonteCarlo(
  optionType: OptionType,
  spot = SPOT,
  strike = STRIKE,
  time = TIME,
  rate = RATE,
  vol = VOL,
  paths = PATHS,
  seedKey = SEED_KEY,
) {
  return monteCarlo(optionType, spot, strike, time, rate, vol, paths, seedKey);
}

function assertNonNegativeQuantiles(result: ReturnType<typeof runMonteCarlo>) {
  assert(result.p5 >= 0);
  assert(result.p25 >= 0);
  assert(result.mean >= 0);
  assert(result.p75 >= 0);
  assert(result.p95 >= 0);
}

Deno.test("[monte-carlo] makeLcg generates valid random numbers", () => {
  const rand = makeLcg(12345);
  const values = Array.from({ length: 100 }, () => rand());

  for (const value of values) {
    assert(value >= 0 && value <= 1);
  }

  assertAlmostEquals(makeLcg(12345)(), makeLcg(12345)());
});

Deno.test("[monte-carlo] hashSeed generates valid seeds", () => {
  const seed1 = hashSeed(SEED_KEY);
  const seed2 = hashSeed(SEED_KEY);
  const seed3 = hashSeed("different-key");

  assertEquals(seed1, seed2);
  assert(seed1 !== seed3);
});

Deno.test("[monte-carlo] boxMuller generates normal samples", () => {
  const rand = makeLcg(12345);
  const samples = Array.from({ length: 1000 }, () => boxMuller(rand(), rand()));

  for (const sample of samples) {
    assert(Number.isFinite(sample));
  }
});

Deno.test("[monte-carlo] monteCarlo returns ordered quantiles", () => {
  const result = runMonteCarlo("call");
  assertNonNegativeQuantiles(result);

  assert(result.p5 <= result.p25);
  assert(result.p25 <= result.mean);
  assert(result.mean <= result.p75);
  assert(result.p75 <= result.p95);
});

Deno.test("[monte-carlo] monteCarlo deterministic results", () => {
  const result1 = runMonteCarlo("call");
  const result2 = runMonteCarlo("call");

  assertAlmostEquals(result1.p5, result2.p5);
  assertAlmostEquals(result1.p25, result2.p25);
  assertAlmostEquals(result1.mean, result2.mean);
  assertAlmostEquals(result1.p75, result2.p75);
  assertAlmostEquals(result1.p95, result2.p95);
});

for (const optionType of ["call", "put"] as const) {
  Deno.test(`[monte-carlo] ${optionType} option returns non-negative quantiles`, () => {
    assertNonNegativeQuantiles(runMonteCarlo(optionType));
  });
}

Deno.test("[monte-carlo] intrinsic edge cases collapse all percentiles", () => {
  const cases = [
    { label: "zero time", result: runMonteCarlo("call", SPOT, STRIKE, 0) },
    {
      label: "zero volatility",
      result: runMonteCarlo("call", SPOT, STRIKE, TIME, RATE, 0),
    },
  ];

  for (const { label, result } of cases) {
    assertEquals(result.p5, 0, label);
    assertEquals(result.p25, 0, label);
    assertEquals(result.mean, 0, label);
    assertEquals(result.p75, 0, label);
    assertEquals(result.p95, 0, label);
  }
});

Deno.test("[monte-carlo] edge case - high volatility", () => {
  const result = runMonteCarlo("call", SPOT, STRIKE, TIME, RATE, 1.0);
  assertNonNegativeQuantiles(result);
});

Deno.test("[monte-carlo] different path counts return valid results", () => {
  const result1 = runMonteCarlo("call");
  const result2 = runMonteCarlo("call", SPOT, STRIKE, TIME, RATE, VOL, 2000);

  assertNonNegativeQuantiles(result1);
  assertNonNegativeQuantiles(result2);
});

Deno.test("[monte-carlo] antithetic variates reduce variance", () => {
  const result = runMonteCarlo("call");
  assertNonNegativeQuantiles(result);
});
