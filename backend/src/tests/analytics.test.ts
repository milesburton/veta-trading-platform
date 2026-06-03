import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from "jsr:@std/assert@0.217";

// Test all analytics modules
import {
  generateStrikes,
  scoreOption,
} from "../analytics/recommendation-engine.ts";

import { rateAt } from "../analytics/spread-analysis.ts";

import { computeYieldCurve } from "../analytics/yield-curve.ts";

import { blackScholes, normCdf, normPdf } from "../analytics/black-scholes.ts";

import { priceBond } from "../analytics/bond-pricing.ts";

import {
  boxMuller,
  hashSeed,
  makeLcg,
  monteCarlo,
} from "../analytics/monte-carlo.ts";

// Test recommendation-engine.ts
Deno.test("[analytics] recommendation-engine - scoreOption returns valid recommendation", () => {
  const result = scoreOption(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  assert(result.optionType === "call" || result.optionType === "put");
  assert(typeof result.strike === "number");
  assert(typeof result.price === "number");
  assert(typeof result.score === "number");
  assert(result.signalStrength !== undefined);
  assert(Array.isArray(result.reasons));
  assert(result.greeks !== undefined);
  assert(typeof result.impliedVol === "number");
  assertEquals(result.scoringMode, "rule-based");
});

Deno.test("[analytics] recommendation-engine - scoreOption with call option", () => {
  const result = scoreOption(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  assert(result.optionType === "call");
  assert(typeof result.price === "number");
  assert(typeof result.score === "number");
  assert(result.signalStrength !== undefined);
  assert(Array.isArray(result.reasons));
  assert(result.greeks !== undefined);
  assert(typeof result.impliedVol === "number");
  assertEquals(result.scoringMode, "rule-based");
});

Deno.test("[analytics] recommendation-engine - scoreOption with put option", () => {
  const result = scoreOption(
    "put",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  assert(result.optionType === "put");
  assert(typeof result.price === "number");
  assert(typeof result.score === "number");
  assert(result.signalStrength !== undefined);
  assert(Array.isArray(result.reasons));
  assert(result.greeks !== undefined);
  assert(typeof result.impliedVol === "number");
  assertEquals(result.scoringMode, "rule-based");
});

Deno.test("[analytics] recommendation-engine - generateStrikes returns valid strikes", () => {
  const strikes = generateStrikes(100);
  assert(Array.isArray(strikes));
  assert(strikes.length > 0);
  assert(strikes.every((strike) => typeof strike === "number"));
});

Deno.test("[analytics] spread-analysis - rateAt returns valid rates", () => {
  const curve = computeYieldCurve();
  const rate = rateAt(curve, 1);
  assert(typeof rate === "number");
});

Deno.test("[analytics] black-scholes - normCdf returns valid values", () => {
  // Test boundary conditions
  assertEquals(normCdf(-Infinity), 0);
  assertEquals(normCdf(Infinity), 1);

  // Test known values with relaxed tolerance
  assertAlmostEquals(normCdf(0), 0.5, 1e-6);
  assertAlmostEquals(normCdf(1), 0.8413447460685429, 1e-6);
  assertAlmostEquals(normCdf(-1), 0.15865525393145707, 1e-6);
});

Deno.test("[analytics] black-scholes - normPdf returns valid values", () => {
  // Test boundary conditions
  assert(normPdf(0) > 0);
  assert(normPdf(Infinity) === 0);
  assert(normPdf(-Infinity) === 0);

  // Test known value
  assertAlmostEquals(normPdf(0), 1 / Math.sqrt(2 * Math.PI), 1e-10);
});

Deno.test("[analytics] black-scholes - call option pricing", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Should return valid price and greeks
  assert(typeof result.price === "number");
  assert(typeof result.greeks.delta === "number");
  assert(typeof result.greeks.gamma === "number");
  assert(typeof result.greeks.theta === "number");
  assert(typeof result.greeks.vega === "number");
  assert(typeof result.greeks.rho === "number");
});

Deno.test("[analytics] black-scholes - put option pricing", () => {
  const result = blackScholes(
    "put",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Should return valid price and greeks
  assert(typeof result.price === "number");
  assert(typeof result.greeks.delta === "number");
  assert(typeof result.greeks.gamma === "number");
  assert(typeof result.greeks.theta === "number");
  assert(typeof result.greeks.vega === "number");
  assert(typeof result.greeks.rho === "number");
});

Deno.test("[analytics] black-scholes - edge case - zero time to expiry", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    0,
    0.05,
    0.2,
  );

  // Should return intrinsic value
  assert(typeof result.price === "number");
  assert(typeof result.greeks.delta === "number");
});

Deno.test("[analytics] black-scholes - edge case - zero volatility", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    1,
    0.05,
    0,
  );

  // Should return intrinsic value
  assert(typeof result.price === "number");
  assert(typeof result.greeks.delta === "number");
});

Deno.test("[analytics] black-scholes - edge case - zero spot price", () => {
  const result = blackScholes(
    "call",
    0,
    100,
    1,
    0.05,
    0.2,
  );

  // Should return intrinsic value
  assert(typeof result.price === "number");
  assert(typeof result.greeks.delta === "number");
});

Deno.test("[analytics] black-scholes - deep ITM call", () => {
  const result = blackScholes(
    "call",
    120,
    100,
    1,
    0.05,
    0.2,
  );

  // Deep ITM call should have delta close to 1
  assert(typeof result.greeks.delta === "number");
  assert(result.greeks.delta > 0.9);
});

Deno.test("[analytics] black-scholes - deep OTM call", () => {
  const result = blackScholes(
    "call",
    80,
    100,
    1,
    0.05,
    0.2,
  );

  // Deep OTM call should have delta close to 0
  assert(typeof result.greeks.delta === "number");
  assert(result.greeks.delta < 0.1);
});

Deno.test("[analytics] black-scholes - deep ITM put", () => {
  const result = blackScholes(
    "put",
    80,
    100,
    1,
    0.05,
    0.2,
  );

  // Deep ITM put should have delta close to -1
  assert(typeof result.greeks.delta === "number");
  assert(result.greeks.delta < -0.9);
});

Deno.test("[analytics] black-scholes - deep OTM put", () => {
  const result = blackScholes(
    "put",
    120,
    100,
    1,
    0.05,
    0.2,
  );

  // Deep OTM put should have delta close to 0
  assert(typeof result.greeks.delta === "number");
  assert(result.greeks.delta > -0.1);
});

Deno.test("[analytics] black-scholes - gamma is positive", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Gamma should be positive
  assert(typeof result.greeks.gamma === "number");
  assert(result.greeks.gamma > 0);
});

Deno.test("[analytics] black-scholes - vega is positive", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Vega should be positive
  assert(typeof result.greeks.vega === "number");
  assert(result.greeks.vega > 0);
});

Deno.test("[analytics] black-scholes - theta is negative", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Theta should be negative (time decay)
  assert(typeof result.greeks.theta === "number");
  assert(result.greeks.theta <= 0);
});

Deno.test("[analytics] black-scholes - rho is positive for call", () => {
  const result = blackScholes(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Rho should be positive for call
  assert(typeof result.greeks.rho === "number");
  assert(result.greeks.rho >= 0);
});

Deno.test("[analytics] black-scholes - rho is negative for put", () => {
  const result = blackScholes(
    "put",
    100,
    100,
    1,
    0.05,
    0.2,
  );

  // Rho should be negative for put
  assert(typeof result.greeks.rho === "number");
  assert(result.greeks.rho <= 0);
});

Deno.test("[analytics] bond-pricing - priceBond returns valid price", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20, // 10 years, semi-annual
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  assert(typeof result.price === "number");
  assert(result.price > 0);
});

Deno.test("[analytics] monte-carlo - makeLcg returns valid generator", () => {
  const generator = makeLcg(1);
  assert(typeof generator === "function");
});

Deno.test("[analytics] monte-carlo - hashSeed returns valid seed", () => {
  const seed = hashSeed("test");
  assert(typeof seed === "number");
});

Deno.test("[analytics] monte-carlo - boxMuller returns valid normal values", () => {
  const result = boxMuller(0.5, 0.5);
  assert(typeof result === "number");
});

Deno.test("[analytics] monte-carlo - monteCarlo returns valid result", () => {
  const result = monteCarlo(
    "call",
    100,
    100,
    1,
    0.05,
    0.2,
    1000,
    "test",
  );

  assert(typeof result === "object");
  assert(typeof result.mean === "number");
  assert(typeof result.p5 === "number");
  assert(typeof result.p25 === "number");
  assert(typeof result.p75 === "number");
  assert(typeof result.p95 === "number");
});

Deno.test("[analytics] yield-curve - computeYieldCurve returns valid curve", () => {
  const curve = computeYieldCurve();
  assert(Array.isArray(curve));
  assert(curve.length > 0);
  assert(curve.every((point) => typeof point.tenorYears === "number"));
  assert(curve.every((point) => typeof point.spotRate === "number"));
});

Deno.test("[analytics] yield-curve - buildYieldCurveResponse returns valid response", () => {
  const response = buildYieldCurveResponse();
  assert(typeof response === "object");
  assert(Array.isArray(response.curve));
  assert(Array.isArray(response.forwardRates));
});
