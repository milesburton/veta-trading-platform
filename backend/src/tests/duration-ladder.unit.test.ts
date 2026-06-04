import { assert, assertAlmostEquals, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { type BondPosition, computeDurationLadder } from "../analytics/duration-ladder.ts";

const TEN_YEAR_BOND: BondPosition = {
  faceValue: 1000,
  couponRate: 0.05,
  totalPeriods: 20, // 10 years, semi-annual
  periodsPerYear: 2,
  yieldAnnual: 0.045,
  quantity: 1,
};

const FIVE_YEAR_BOND: BondPosition = {
  faceValue: 1000,
  couponRate: 0.05,
  totalPeriods: 10, // 5 years, semi-annual
  periodsPerYear: 2,
  yieldAnnual: 0.043,
  quantity: 1,
};

Deno.test("[duration-ladder] single bond: bucket DV01s sum to total DV01", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const pos = result.positions[0];

  // Total DV01 should match the bond's DV01
  const bondDv01 = pos.totalDv01;
  const bucketSum = pos.contributions.reduce((s, c) => s + c.dv01Contribution, 0);

  assertAlmostEquals(bucketSum, bondDv01, 1e-6);
});

Deno.test("[duration-ladder] single bond: short position has negative total DV01", () => {
  const shortBond: BondPosition = { ...TEN_YEAR_BOND, quantity: -1 };
  const result = computeDurationLadder([shortBond]);

  assert(result.positions[0].totalDv01 < 0, "Short bond should have negative DV01");
  assert(result.totalPortfolioDv01 < 0, "Short portfolio should have negative total DV01");
});

Deno.test("[duration-ladder] long + short same bond: net portfolio DV01 is zero", () => {
  const longBond: BondPosition = { ...TEN_YEAR_BOND, quantity: 1 };
  const shortBond: BondPosition = { ...TEN_YEAR_BOND, quantity: -1 };
  const result = computeDurationLadder([longBond, shortBond]);

  assertAlmostEquals(
    result.totalPortfolioDv01,
    0,
    1e-10,
    "Hedged position should have zero portfolio DV01"
  );
});

Deno.test("[duration-ladder] returns correct bucket labels", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const labels = result.buckets.map((b) => b.tenorLabel);
  assertEquals(labels, ["3m", "1y", "2y", "5y", "10y", "30y"]);
});

Deno.test("[duration-ladder] 10y bond has most DV01 in 10y bucket", () => {
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const buckets = result.buckets;
  const tenYearBucket = buckets.find((b) => b.tenorLabel === "10y");
  assertExists(tenYearBucket);
  const otherBuckets = buckets.filter((b) => b.tenorLabel !== "10y");
  const maxOther = Math.max(...otherBuckets.map((b) => b.netDv01));

  assert(
    tenYearBucket.netDv01 > maxOther,
    `10y bucket DV01 (${tenYearBucket.netDv01}) should be largest for a 10y bond`
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

Deno.test("[duration-ladder] returns computedAt timestamp", () => {
  const before = Date.now();
  const result = computeDurationLadder([TEN_YEAR_BOND]);
  const after = Date.now();

  assert(result.computedAt >= before && result.computedAt <= after);
});

Deno.test("[duration-ladder] empty portfolio returns zero DV01", () => {
  const result = computeDurationLadder([]);

  assertEquals(result.totalPortfolioDv01, 0);
  assertEquals(result.positions.length, 0);
  assertEquals(result.buckets.length, 6);
});
