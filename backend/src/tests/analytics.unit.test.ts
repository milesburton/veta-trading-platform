import { assertEquals, assertAlmostEquals, assert } from "https://deno.land/std@0.210.0/assert/mod.ts";
import { computeSpreadAnalysis } from "../analytics/spread-analysis.ts";
import { computeDurationLadder } from "../analytics/duration-ladder.ts";
import type { BondPosition } from "../analytics/duration-ladder.ts";
import { buildVolSurface } from "../analytics/vol-surface.ts";
import { priceBond } from "../analytics/bond-pricing.ts";
import { computeYieldCurve } from "../analytics/yield-curve.ts";
import { rateAt } from "../analytics/spread-analysis.ts";


Deno.test("[spread-analysis] G-spread is bondYield minus govSpotRate in bps", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20, // 10-year semi-annual
    yieldAnnual: 0.055,
    periodsPerYear: 2,
  });
  assertEquals(result.tenorYears, 10);
  const expected = (result.bondYield - result.govSpotRate) * 10_000;
  assertAlmostEquals(result.gSpread, expected, 1e-6);
});

Deno.test("[spread-analysis] bond at gov yield has near-zero G-spread", () => {
  const curve = computeYieldCurve();
  const govRate10y = rateAt(curve, 10);
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    yieldAnnual: govRate10y,
  });
  assert(Math.abs(result.gSpread) < 0.1, `G-spread ${result.gSpread} should be near 0`);
});

Deno.test("[spread-analysis] yield premium gives positive G-spread", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    yieldAnnual: 0.065, // 100bp above typical gov rate
  });
  assert(result.gSpread > 0, "G-spread should be positive when bond yield > gov rate");
});

Deno.test("[spread-analysis] Z-spread converges: PV at curve+z equals bond price", () => {
  const couponRate = 0.05;
  const totalPeriods = 20;
  const periodsPerYear = 2;
  const yieldAnnual = 0.055;
  const face = 1000;

  const result = computeSpreadAnalysis({
    couponRate,
    totalPeriods,
    periodsPerYear,
    yieldAnnual,
    face,
  });

  const bondPrice = priceBond({ couponRate, totalPeriods, periodsPerYear, yieldAnnual, face }).price;
  const curve = computeYieldCurve();
  const zDecimal = result.zSpread / 10_000;
  const couponPerPeriod = (couponRate * face) / periodsPerYear;

  let pvCheck = 0;
  for (let i = 1; i <= totalPeriods; i++) {
    const t = i / periodsPerYear;
    const cf = i === totalPeriods ? couponPerPeriod + face : couponPerPeriod;
    pvCheck += cf * Math.exp(-(rateAt(curve, t) + zDecimal) * t);
  }

  assertAlmostEquals(pvCheck, bondPrice, 0.001, "Z-spread discounted PV should match bond price");
});

Deno.test("[spread-analysis] OAS equals Z-spread for vanilla bond", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    yieldAnnual: 0.055,
  });
  assertEquals(result.oas, result.zSpread, "OAS must equal Z-spread for vanilla bond");
});

Deno.test("[spread-analysis] Z-spread is non-negative for above-gov-yield bond", () => {
  const result = computeSpreadAnalysis({
    couponRate: 0.05,
    totalPeriods: 20,
    yieldAnnual: 0.055, // above typical 10y gov rate of ~4.5%
  });
  assert(result.zSpread >= 0, `Z-spread ${result.zSpread}bp should be non-negative`);
});

Deno.test("[spread-analysis] returns computedAt timestamp", () => {
  const before = Date.now();
  const result = computeSpreadAnalysis({ couponRate: 0.05, totalPeriods: 10, yieldAnnual: 0.05 });
  const after = Date.now();
  assert(result.computedAt >= before && result.computedAt <= after);
});


const TEN_YEAR_BOND: BondPosition = {
  faceValue: 1000,
  couponRate: 0.05,
  totalPeriods: 20,
  periodsPerYear: 2,
  yieldAnnual: 0.045,
  quantity: 1,
};

const FIVE_YEAR_BOND: BondPosition = {
  faceValue: 1000,
  couponRate: 0.05,
  totalPeriods: 10,
  periodsPerYear: 2,
  yieldAnnual: 0.043,
  quantity: 1,
};

Deno.test("[duration-ladder] single bond: bucket DV01s sum to total DV01", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const pos = result.positions[0];

  const bp = priceBond({
    face: TEN_YEAR_BOND.faceValue,
    couponRate: TEN_YEAR_BOND.couponRate,
    totalPeriods: TEN_YEAR_BOND.totalPeriods,
    periodsPerYear: TEN_YEAR_BOND.periodsPerYear,
    yieldAnnual: TEN_YEAR_BOND.yieldAnnual,
  });
  assertAlmostEquals(pos.totalDv01, bp.dv01, 1e-6, "totalDv01 should match priceBond dv01");

  const bucketSum = pos.contributions.reduce((s, c) => s + c.dv01Contribution, 0);
  assertAlmostEquals(bucketSum, pos.totalDv01, 1e-6, "bucket contributions should sum to totalDv01");
});

Deno.test("[duration-ladder] short position has negative total DV01", () => {
  const shortBond: BondPosition = { ...TEN_YEAR_BOND, quantity: -1 };
  const result = computeDurationLadder([shortBond]);
  assert(result.positions[0].totalDv01 < 0, "Short bond should have negative DV01");
  assert(result.totalPortfolioDv01 < 0, "Short portfolio should have negative total DV01");
});

Deno.test("[duration-ladder] long + short same bond: net portfolio DV01 is zero", () => {
  const longBond: BondPosition = { ...TEN_YEAR_BOND, quantity: 1 };
  const shortBond: BondPosition = { ...TEN_YEAR_BOND, quantity: -1 };
  const result = computeDurationLadder([longBond, shortBond]);
  assertAlmostEquals(result.totalPortfolioDv01, 0, 1e-10, "Hedged position should have zero portfolio DV01");
});

Deno.test("[duration-ladder] returns correct bucket labels", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const labels = result.buckets.map((b) => b.tenorLabel);
  assertEquals(labels, ["3m", "1y", "2y", "5y", "10y", "30y"]);
});

Deno.test("[duration-ladder] 10y bond has most DV01 in 10y bucket", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const buckets = result.buckets;
  const tenYearBucket = buckets.find((b) => b.tenorLabel === "10y")!;
  const otherBuckets = buckets.filter((b) => b.tenorLabel !== "10y");
  const maxOther = Math.max(...otherBuckets.map((b) => b.netDv01));
  assert(
    tenYearBucket.netDv01 > maxOther,
    `10y bucket DV01 (${tenYearBucket.netDv01}) should be largest for a 10y bond`,
  );
});

Deno.test("[duration-ladder] multi-position: totalPortfolioDv01 = sum of position DV01s", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND, FIVE_YEAR_BOND]);
  const posSum = result.positions.reduce((s, p) => s + p.totalDv01, 0);
  assertAlmostEquals(result.totalPortfolioDv01, posSum, 1e-10);
});

Deno.test("[duration-ladder] quantity scaling: 10 bonds have 10× DV01 of 1 bond", () => {
  const single = computeDurationLadder([TEN_YEAR_BOND]);
  const ten = computeDurationLadder([{ ...TEN_YEAR_BOND, quantity: 10 }]);
  assertAlmostEquals(ten.totalPortfolioDv01, single.totalPortfolioDv01 * 10, 1e-8);
});


Deno.test("[vol-surface] surface has exactly 45 points (5 expiries × 9 strikes)", () => {
  const result = buildVolSurface("AAPL", 189.30, 0.25);
  assertEquals(result.surface.length, 45);
});

Deno.test("[vol-surface] ATM vol (moneyness=1.0) equals atTheMoneyVol", () => {
  const atmVol = 0.25;
  const result = buildVolSurface("AAPL", 189.30, atmVol);
  const atmPoints = result.surface.filter((p) => p.moneyness === 1.0);
  assertEquals(atmPoints.length, 5); // one per expiry
  for (const p of atmPoints) {
    assertAlmostEquals(p.impliedVol, atmVol, 1e-10, `ATM vol should equal ${atmVol} for expiry ${p.expiryLabel}`);
  }
});

Deno.test("[vol-surface] OTM put (moneyness=0.70) has higher IV than ATM due to skew", () => {
  const result = buildVolSurface("AAPL", 189.30, 0.25);
  for (const expiryLabel of ["7d", "30d", "90d"]) {
    const otm = result.surface.find((p) => p.moneyness === 0.70 && p.expiryLabel === expiryLabel)!;
    const atm = result.surface.find((p) => p.moneyness === 1.0 && p.expiryLabel === expiryLabel)!;
    assert(otm.impliedVol > atm.impliedVol, `OTM put IV (${otm.impliedVol}) should exceed ATM (${atm.impliedVol}) for ${expiryLabel}`);
  }
});

Deno.test("[vol-surface] all implied vols are positive", () => {
  const result = buildVolSurface("TEST", 100, 0.30);
  for (const p of result.surface) {
    assert(p.impliedVol > 0, `IV at moneyness=${p.moneyness} expiry=${p.expiryLabel} should be positive`);
  }
});

Deno.test("[vol-surface] strike = spot × moneyness (rounded to cents)", () => {
  const spot = 200.00;
  const result = buildVolSurface("TEST", spot, 0.20);
  for (const p of result.surface) {
    const expected = Math.round(spot * p.moneyness * 100) / 100;
    assertAlmostEquals(p.strike, expected, 0.005, `Strike should equal spot × moneyness`);
  }
});

Deno.test("[vol-surface] expiry labels match expected values", () => {
  const result = buildVolSurface("AAPL", 189.30, 0.25);
  const expiries = [...new Set(result.surface.map((p) => p.expiryLabel))].sort();
  assertEquals(expiries, ["14d", "30d", "60d", "7d", "90d"]);
});

Deno.test("[vol-surface] OTM call (moneyness=1.30) has higher IV than ATM", () => {
  const result = buildVolSurface("AAPL", 189.30, 0.25);
  const otmCall = result.surface.find((p) => p.moneyness === 1.30 && p.expiryLabel === "30d")!;
  const atm = result.surface.find((p) => p.moneyness === 1.0 && p.expiryLabel === "30d")!;
  assert(otmCall.impliedVol > 0.5 * atm.impliedVol, "OTM call should have reasonable IV");
  assert(otmCall.impliedVol < 2.0 * atm.impliedVol, "OTM call IV should not explode");
});

Deno.test("[vol-surface] returns correct metadata", () => {
  const before = Date.now();
  const result = buildVolSurface("MSFT", 420.00, 0.22);
  const after = Date.now();
  assertEquals(result.symbol, "MSFT");
  assertAlmostEquals(result.spotPrice, 420.00, 1e-10);
  assertAlmostEquals(result.atTheMoneyVol, 0.22, 1e-10);
  assertEquals(result.expiries.length, 5);
  assertEquals(result.moneynesses.length, 9);
  assert(result.computedAt >= before && result.computedAt <= after);
});
