import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
} from "jsr:@std/assert@0.217";
import type {
  NelsonSiegelParams,
  YieldCurvePoint,
} from "../analytics/types.ts";
import {
  _internalForTests,
  buildYieldCurveResponse,
  computeYieldCurve,
  forwardRates,
  rateAt,
} from "../analytics/yield-curve.ts";

const DEFAULT_PARAMS: NelsonSiegelParams = {
  beta0: 0.045,
  beta1: -0.015,
  beta2: 0.01,
  lambda: 2.5,
};

Deno.test("[yield-curve] computeYieldCurve returns default tenor set", () => {
  const curve = computeYieldCurve();
  assertEquals(curve.length, 10);
  assertEquals(curve[0].tenorLabel, "3m");
  assertEquals(curve[0].tenorYears, 0.25);
  assertEquals(curve.at(-1)?.tenorLabel, "30y");
  assertEquals(curve.at(-1)?.tenorYears, 30);
  for (const point of curve) assertGreater(point.spotRate, 0);
});

Deno.test("[yield-curve] computeYieldCurve applies parameter overrides", () => {
  const baseline = computeYieldCurve();
  const shifted = computeYieldCurve({ beta0: 0.1 });
  for (let index = 0; index < baseline.length; index++) {
    assertGreater(shifted[index].spotRate, baseline[index].spotRate);
  }
});

Deno.test("[yield-curve] rateAt clamps and interpolates correctly", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.05 },
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.01 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.02 },
  ];
  assertEquals(rateAt(curve, 0.5), 0.01);
  assertEquals(rateAt(curve, 10), 0.05);
  assertAlmostEquals(rateAt(curve, 1.5), 0.015, 1e-12);
});

Deno.test("[yield-curve] forwardRates match a flat curve", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.03 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.03 },
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.03 },
    { tenorYears: 10, tenorLabel: "10y", spotRate: 0.03 },
    { tenorYears: 30, tenorLabel: "30y", spotRate: 0.03 },
  ];
  for (const point of forwardRates(curve)) {
    assertAlmostEquals(point.rate, 0.03, 1e-12);
  }
});

Deno.test("[yield-curve] response uses defaults and caller overrides", () => {
  const before = Date.now();
  const response = buildYieldCurveResponse({ beta0: 0.08 });
  const after = Date.now();
  assertEquals(response.curve.length, 10);
  assertEquals(response.forwardRates.length, 5);
  assert(response.computedAt >= before && response.computedAt <= after);
  for (const point of response.curve) assertGreater(point.spotRate, 0.03);
});

Deno.test("[yield-curve] nelsonSiegel handles non-positive tau", () => {
  const { nelsonSiegel } = _internalForTests;
  assertEquals(
    nelsonSiegel(0, DEFAULT_PARAMS),
    DEFAULT_PARAMS.beta0 + DEFAULT_PARAMS.beta1,
  );
  assertEquals(
    nelsonSiegel(-1, DEFAULT_PARAMS),
    DEFAULT_PARAMS.beta0 + DEFAULT_PARAMS.beta1,
  );
});
