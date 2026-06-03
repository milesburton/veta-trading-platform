import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from "jsr:@std/assert@0.217";
import {
  computeYieldCurve,
  rateAt,
  forwardRates,
  buildYieldCurveResponse,
  _internalForTests,
} from "../analytics/yield-curve.ts";

Deno.test("[yield-curve] computeYieldCurve returns valid curve points", () => {
  const curve = computeYieldCurve();
  
  // Should return array of points
  assert(Array.isArray(curve));
  assert(curve.length > 0);
  
  // Should have correct structure
  for (const point of curve) {
    assert(point.tenorYears !== undefined);
    assert(point.tenorLabel !== undefined);
    assert(point.spotRate !== undefined);
    assert(point.spotRate >= 0);
  }
});

Deno.test("[yield-curve] computeYieldCurve with custom parameters", () => {
  const customParams = {
    beta0: 0.05,
    beta1: -0.02,
    beta2: 0.01,
    lambda: 3.0,
  };
  
  const curve = computeYieldCurve(customParams);
  
  // Should return valid curve with custom parameters
  assert(Array.isArray(curve));
  assert(curve.length > 0);
  
  // First point should be at 3m
  assertEquals(curve[0].tenorYears, 0.25);
  assert(curve[0].spotRate >= 0);
});

Deno.test("[yield-curve] rateAt interpolates correctly", () => {
  const curve = computeYieldCurve();
  
  // Test interpolation between two points
  const rate1 = rateAt(curve, 1.5);
  assert(rate1 >= 0);
  
  // Test boundary conditions
  const rate2 = rateAt(curve, 0.1); // Should return first rate
  assertEquals(rate2, curve[0].spotRate);
  
  const rate3 = rateAt(curve, 35); // Should return last rate
  assertEquals(rate3, curve[curve.length - 1].spotRate);
});

Deno.test("[yield-curve] forwardRates returns valid forward rates", () => {
  const curve = computeYieldCurve();
  const forwards = forwardRates(curve);
  
  // Should return array of forward rates
  assert(Array.isArray(forwards));
  assert(forwards.length > 0);
  
  // Should have correct structure
  for (const forward of forwards) {
    assert(forward.fromYears !== undefined);
    assert(forward.toYears !== undefined);
    assert(forward.label !== undefined);
    assert(forward.rate !== undefined);
    assert(forward.rate >= 0);
  }
});

Deno.test("[yield-curve] buildYieldCurveResponse returns complete response", () => {
  const response = buildYieldCurveResponse();
  
  // Should return complete response
  assert(response.curve !== undefined);
  assert(response.forwardRates !== undefined);
  assert(response.computedAt !== undefined);
  
  // Curve should be valid
  assert(Array.isArray(response.curve));
  assert(response.curve.length > 0);
  
  // Forward rates should be valid
  assert(Array.isArray(response.forwardRates));
  assert(response.forwardRates.length > 0);
});

Deno.test("[yield-curve] nelsonSiegel function works correctly", () => {
  const { nelsonSiegel } = _internalForTests;
  
  // Test with default parameters
  const rate1 = nelsonSiegel(1, {
    beta0: 0.045,
    beta1: -0.015,
    beta2: 0.010,
    lambda: 2.5,
  });
  
  assert(rate1 >= 0);
  
  // Test with zero time
  const rate2 = nelsonSiegel(0, {
    beta0: 0.045,
    beta1: -0.015,
    beta2: 0.010,
    lambda: 2.5,
  });
  
  assert(rate2 >= 0);
});

Deno.test("[yield-curve] curve points are in ascending order", () => {
  const curve = computeYieldCurve();
  
  // Tenor years should be ascending
  for (let i = 1; i < curve.length; i++) {
    assert(curve[i].tenorYears >= curve[i - 1].tenorYears);
  }
});

Deno.test("[yield-curve] spot rates are reasonable", () => {
  const curve = computeYieldCurve();
  
  // Spot rates should be reasonable (not negative, not extremely high)
  for (const point of curve) {
    assert(point.spotRate >= 0);
    assert(point.spotRate < 0.20); // 20% is very high for a yield curve
  }
});

Deno.test("[yield-curve] forward rates are calculated correctly", () => {
  const curve = computeYieldCurve();
  const forwards = forwardRates(curve);
  
  // Forward rates should be reasonable
  for (const forward of forwards) {
    assert(forward.rate >= 0);
    assert(forward.fromYears < forward.toYears);
  }
});

Deno.test("[yield-curve] returns consistent results", () => {
  const curve1 = computeYieldCurve();
  const curve2 = computeYieldCurve();
  
  // Multiple calls should return similar results
  assertEquals(curve1.length, curve2.length);
  
  for (let i = 0; i < curve1.length; i++) {
    assertAlmostEquals(curve1[i].tenorYears, curve2[i].tenorYears);
    assertAlmostEquals(curve1[i].spotRate, curve2[i].spotRate);
  }
});