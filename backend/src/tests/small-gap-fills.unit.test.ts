import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@0.217";

import {
  computeDurationLadder,
  type BondPosition,
} from "../analytics/duration-ladder.ts";
import { rateAt } from "../analytics/spread-analysis.ts";
import {
  buildYieldCurveResponse,
  computeYieldCurve,
  rateAt as yieldCurveRateAt,
} from "../analytics/yield-curve.ts";
import type { YieldCurvePoint } from "../analytics/types.ts";
import { getBond, getBonds } from "../market-sim/bondUniverse.ts";

Deno.test("[duration-ladder] short-tenor bond (<3m) attributes entirely to the 3m bucket", () => {
  const bond: BondPosition = {
    faceValue: 1_000,
    couponRate: 0.04,
    periodsPerYear: 4,
    totalPeriods: 1,
    yieldAnnual: 0.045,
    quantity: 1,
  };
  const res = computeDurationLadder([bond]);
  const bucket3m = res.buckets.find((b) => b.tenorLabel === "3m");
  assert(bucket3m, "3m bucket missing");
  assert(Math.abs(bucket3m.netDv01) > 0, "3m bucket should carry all DV01");
  for (const b of res.buckets) {
    if (b.tenorLabel === "3m") continue;
    assertEquals(b.netDv01, 0, `expected 0 DV01 in ${b.tenorLabel} bucket, got ${b.netDv01}`);
  }
});

Deno.test("[duration-ladder] long-tenor bond (>30y) attributes entirely to the 30y bucket", () => {
  const bond: BondPosition = {
    faceValue: 1_000,
    couponRate: 0.05,
    periodsPerYear: 1,
    totalPeriods: 50,
    yieldAnnual: 0.05,
    quantity: 1,
  };
  const res = computeDurationLadder([bond]);
  const bucket30y = res.buckets.find((b) => b.tenorLabel === "30y");
  assert(bucket30y, "30y bucket missing");
  assert(Math.abs(bucket30y.netDv01) > 0, "30y bucket should carry positive DV01");
});

Deno.test("[spread-analysis rateAt] clamps below the lowest tenor to the lowest spot", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.03 },
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.04 },
  ];
  assertEquals(rateAt(curve, 0.01), 0.03);
  assertEquals(rateAt(curve, 0), 0.03);
});

Deno.test("[spread-analysis rateAt] clamps above the highest tenor to the highest spot", () => {
  const curve: YieldCurvePoint[] = [
    { tenorYears: 1, tenorLabel: "1y", spotRate: 0.03 },
    { tenorYears: 5, tenorLabel: "5y", spotRate: 0.04 },
  ];
  assertEquals(rateAt(curve, 10), 0.04);
  assertEquals(rateAt(curve, 5), 0.04);
});

Deno.test("[yield-curve] nelsonSiegel: tau=0 returns beta0 + beta1", () => {
  const r = buildYieldCurveResponse({ beta0: 0.05, beta1: -0.02, beta2: 0.01, lambda: 2.5 });
  assert(r.curve.length > 0);
});

Deno.test("[yield-curve rateAt] handles tau=0 via the tau<=0 nelsonSiegel branch", () => {
  const params = { beta0: 0.05, beta1: -0.02, beta2: 0.01, lambda: 2.5 };
  const curve = computeYieldCurve(params);
  const r0 = yieldCurveRateAt(curve, 0);
  assertAlmostEquals(r0, curve[0].spotRate, 1e-9);
});

Deno.test("[bondUniverse] getBond returns the matching definition for a known symbol", () => {
  const all = getBonds();
  assert(all.length > 0, "BOND_UNIVERSE should be non-empty");
  const known = all[0];
  const b = getBond(known.symbol);
  assertEquals(b?.symbol, known.symbol);
});

Deno.test("[bondUniverse] getBond returns undefined for an unknown symbol", () => {
  assertEquals(getBond("NOPE-DOES-NOT-EXIST"), undefined);
});

Deno.test("[bondUniverse] getBonds filters by issuer when provided", () => {
  const ust = getBonds({ issuer: "UST" });
  const corp = getBonds({ issuer: "Corp" });
  assert(ust.length > 0, "should have UST bonds");
  assert(corp.length > 0, "should have Corp bonds");
  for (const b of ust) assertEquals(b.issuer, "UST");
  for (const b of corp) assertEquals(b.issuer, "Corp");
});

Deno.test("[bondUniverse] getBonds returns the full universe when no filter is given", () => {
  const all = getBonds();
  const explicit = getBonds(undefined);
  const noField = getBonds({});
  assertEquals(all.length, explicit.length);
  assertEquals(all.length, noField.length);
});

