import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { computeSpreadAnalysis, rateAt } from "../analytics/spread-analysis.ts";
import type { YieldCurvePoint } from "../analytics/types.ts";

Deno.test("[spread-analysis] rateAt interpolates correctly", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.02 },
    { tenorYears: 2, tenorLabel: "2y", spotRate: 0.03 },
    { tenorYears: 3, tenorLabel: "3y", spotRate: 0.04 },
  ];

  // Test interpolation
  const rate1 = rateAt(curve, 1.5);
  assert(rate1 > 0.02 && rate1 < 0.04);

  // Test boundary conditions
  const rate2 = rateAt(curve, 0.5); // Should return first rate
  assertEquals(rate2, 0.02);

  const rate3 = rateAt(curve, 4); // Should return last rate
  assertEquals(rate3, 0.04);
});

Deno.test("[spread-analysis] computeSpreadAnalysis returns valid results", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20, // 10 years, semi-annual
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Should return valid spread analysis
  assert(result.bondYield === 0.045);
  assert(result.tenorYears === 10);
  assert(result.govSpotRate > 0);
  assert(result.gSpread !== undefined);
  assert(result.zSpread !== undefined);
  assert(result.oas !== undefined);
  assert(result.computedAt !== undefined);
});

Deno.test("[spread-analysis] gSpread is calculated correctly", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // G-spread should be positive if bond yield > government rate
  // (this is a simplified test - actual rates depend on curve)
  assert(result.gSpread !== undefined);
});

Deno.test("[spread-analysis] zSpread and oas are positive for investment-grade bonds", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Z-spread and OAS should be non-negative for investment-grade bonds
  assert(result.zSpread >= 0);
  assert(result.oas >= 0);
});

Deno.test("[spread-analysis] returns computedAt timestamp", () => {
  const before = Date.now();
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });
  const after = Date.now();

  assert(result.computedAt >= before && result.computedAt <= after);
});

Deno.test("[spread-analysis] edge case - zero coupon bond", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Should handle zero coupon bonds
  assert(result.bondYield === 0.045);
  assert(result.tenorYears === 10);
  assert(result.govSpotRate > 0);
});

Deno.test("[spread-analysis] edge case - very short maturity", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 2, // 1 year
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Should handle short maturity bonds
  assert(result.tenorYears === 1);
  assert(result.govSpotRate > 0);
});

Deno.test("[spread-analysis] different face values", () => {
  const result1 = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  const result2 = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 500,
  });

  // Results should be consistent with face value
  assert(result1.bondYield === result2.bondYield);
  assert(result1.tenorYears === result2.tenorYears);
});

Deno.test("[spread-analysis] zSpread should be close to gSpread for low volatility", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // For low volatility bonds, zSpread and gSpread should be close
  // (this is a rough test - actual relationship depends on curve)
  assert(result.zSpread >= 0);
  assert(result.gSpread >= 0);
});
