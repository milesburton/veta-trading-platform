import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { priceBond } from "../analytics/bond-pricing.ts";

Deno.test("[bond-pricing] priceBond returns valid results", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20, // 10 years, semi-annual
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Should return valid bond pricing
  assert(result.price > 0);
  assert(result.yieldAnnual === 0.045);
  assert(result.modifiedDuration >= 0);
  assert(result.convexity >= 0);
  assert(result.dv01 >= 0);
  assert(result.cashFlows !== undefined);
  assert(result.computedAt !== undefined);
});

Deno.test("[bond-pricing] bond price is reasonable", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Bond price should be positive
  assert(result.price > 0);

  // For a 5% coupon bond with 4.5% yield, price should be above face value
  assert(result.price > 1000);
});

Deno.test("[bond-pricing] zero coupon bond", () => {
  const result = priceBond({
    couponRate: 0,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Zero coupon bond should have price less than face value
  assert(result.price < 1000);
});

Deno.test("[bond-pricing] edge case - zero yield", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0,
    face: 1000,
  });

  // Zero yield should result in high price
  assert(result.price > 1000);
});

Deno.test("[bond-pricing] edge case - zero periods", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 0,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Zero periods should result in zero price
  assertEquals(result.price, 0);
  assertEquals(result.modifiedDuration, 0);
  assertEquals(result.convexity, 0);
  assertEquals(result.dv01, 0);
});

Deno.test("[bond-pricing] cash flows are computed correctly", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 4, // 2 years
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Should have correct number of cash flows
  assert(Array.isArray(result.cashFlows));
  assertEquals(result.cashFlows.length, 4);

  // First cash flows should be coupons
  assert(result.cashFlows[0].cf > 0);
  assert(result.cashFlows[0].t > 0);

  // Last cash flow should include principal
  assert(result.cashFlows[3].cf > 1000); // Includes principal
});

Deno.test("[bond-pricing] duration is positive", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Duration should be positive
  assert(result.modifiedDuration >= 0);
});

Deno.test("[bond-pricing] convexity is positive", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // Convexity should be positive
  assert(result.convexity >= 0);
});

Deno.test("[bond-pricing] dv01 is positive", () => {
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  // DV01 should be positive
  assert(result.dv01 >= 0);
});

Deno.test("[bond-pricing] different face values", () => {
  const result1 = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });

  const result2 = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 500,
  });

  // Results should be consistent with face value
  assert(result1.price > result2.price);
  assert(result1.modifiedDuration === result2.modifiedDuration);
  assert(result1.convexity === result2.convexity);
  assert(result1.dv01 > result2.dv01);
});

Deno.test("[bond-pricing] returns computedAt timestamp", () => {
  const before = Date.now();
  const result = priceBond({
    couponRate: 0.05,
    totalPeriods: 20,
    periodsPerYear: 2,
    yieldAnnual: 0.045,
    face: 1000,
  });
  const after = Date.now();

  assert(result.computedAt >= before && result.computedAt <= after);
});
