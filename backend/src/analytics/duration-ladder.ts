/**
 * Key-rate duration ladder.
 *
 * Decomposes a portfolio of fixed-income positions into DV01 contributions
 * per key-rate tenor bucket using cash-flow attribution with linear interpolation.
 *
 * Key-rate tenors: 0.25y (3m), 1y, 2y, 5y, 10y, 30y
 *
 * Each cash flow at time t is split between the two surrounding key-rate buckets
 * by proximity:
 *   attr_lo = pv × (tHi − t) / (tHi − tLo)
 *   attr_hi = pv × (t − tLo) / (tHi − tLo)
 *
 * Then dv01_bucket = Σ pv_attributed × 0.0001
 */

import { priceBond } from "./bond-pricing.ts";

export interface BondPosition {
  faceValue: number; // face value (e.g. 1000)
  couponRate: number; // annual coupon rate, e.g. 0.05
  totalPeriods: number; // total coupon periods
  periodsPerYear?: number; // default 2
  yieldAnnual: number; // current yield
  quantity: number; // signed: positive = long, negative = short
}

export interface DurationLadderResponse {
  positions: {
    bondIndex: number;
    totalDv01: number;
    modifiedDuration: number;
    contributions: {
      bondIndex: number;
      tenorLabel: string;
      dv01Contribution: number;
    }[];
  }[];
  buckets: {
    tenorLabel: string;
    tenorYears: number;
    netDv01: number;
  }[];
  totalPortfolioDv01: number;
  computedAt: number;
}

const KEY_RATE_BUCKETS: { tenorYears: number; tenorLabel: string }[] = [
  { tenorYears: 0.25, tenorLabel: "3m" },
  { tenorYears: 1.0, tenorLabel: "1y" },
  { tenorYears: 2.0, tenorLabel: "2y" },
  { tenorYears: 5.0, tenorLabel: "5y" },
  { tenorYears: 10.0, tenorLabel: "10y" },
  { tenorYears: 30.0, tenorLabel: "30y" },
];

/**
 * Attribute a present-value amount to key-rate buckets.
 * Returns a map of tenorLabel → attributed PV.
 */
function attributeToBuckets(t: number, pv: number): Map<string, number> {
  const result = new Map<string, number>(
    KEY_RATE_BUCKETS.map((b) => [b.tenorLabel, 0]),
  );

  const buckets = KEY_RATE_BUCKETS;

  // Before first bucket: all to first
  if (t <= buckets[0].tenorYears) {
    result.set(buckets[0].tenorLabel, pv);
    return result;
  }

  // After last bucket: all to last
  if (t >= buckets[buckets.length - 1].tenorYears) {
    result.set(buckets[buckets.length - 1].tenorLabel, pv);
    return result;
  }

  // Find surrounding buckets and split linearly
  for (let i = 0; i < buckets.length - 1; i++) {
    const lo = buckets[i];
    const hi = buckets[i + 1];
    if (t >= lo.tenorYears && t <= hi.tenorYears) {
      const span = hi.tenorYears - lo.tenorYears;
      const attrHi = pv * (t - lo.tenorYears) / span;
      const attrLo = pv - attrHi;
      result.set(lo.tenorLabel, (result.get(lo.tenorLabel) ?? 0) + attrLo);
      result.set(hi.tenorLabel, (result.get(hi.tenorLabel) ?? 0) + attrHi);
      return result;
    }
  }

  return result;
}

export function computeDurationLadder(
  positions: BondPosition[],
): DurationLadderResponse {
  // Accumulate net DV01 per bucket across all positions
  const netBucketDv01 = new Map<string, number>(
    KEY_RATE_BUCKETS.map((b) => [b.tenorLabel, 0]),
  );

  const positionResults: DurationLadderResponse["positions"] = positions.map(
    (pos, bondIndex) => {
      const periodsPerYear = pos.periodsPerYear ?? 2;
      const { faceValue, couponRate, totalPeriods, yieldAnnual, quantity } =
        pos;

      // Get pricing metrics for this bond (unit size = 1 bond)
      const priceResult = priceBond({
        face: faceValue,
        couponRate,
        periodsPerYear,
        totalPeriods,
        yieldAnnual,
      });

      // Total DV01 scaled by quantity (signed)
      const totalDv01 = priceResult.dv01 * quantity;

      // Build cash flow schedule for attribution
      const couponPerPeriod = (couponRate * faceValue) / periodsPerYear;

      // DV01 attribution per bucket for this position
      const bucketAttribution = new Map<string, number>(
        KEY_RATE_BUCKETS.map((b) => [b.tenorLabel, 0]),
      );

      for (let i = 1; i <= totalPeriods; i++) {
        const t = i / periodsPerYear;
        const cf = i === totalPeriods
          ? couponPerPeriod + faceValue
          : couponPerPeriod;
        const pv = cf * Math.exp(-yieldAnnual * t);

        // DV01 contribution of this cash flow = pv × t × 0.0001 (from modified duration formula)
        // Then distribute across key-rate buckets proportionally to pv attribution
        const cfDv01 = pv * t * 0.0001 * quantity;

        // Attribution weights sum to 1 for this cash flow
        const pvAttrib = attributeToBuckets(t, pv * Math.abs(quantity));
        for (const [label, pvAmt] of pvAttrib) {
          // Scale dv01 by the fraction of pv attributed to this bucket
          const fraction = priceResult.price * Math.abs(quantity) > 0
            ? pvAmt / (priceResult.price * Math.abs(quantity))
            : 0;
          const bucketDv01 = cfDv01 * fraction * priceResult.price *
            Math.abs(quantity) / (pv > 0 ? pv : 1);
          bucketAttribution.set(
            label,
            (bucketAttribution.get(label) ?? 0) +
              bucketDv01 *
                (pv > 0 ? pv / (priceResult.price * Math.abs(quantity)) : 0),
          );
        }
      }

      // Simpler, more accurate approach: attribute total DV01 by proportion of each bucket's
      // accumulated PV-weighted duration contribution
      const bucketDv01Direct = new Map<string, number>(
        KEY_RATE_BUCKETS.map((b) => [b.tenorLabel, 0]),
      );

      for (let i = 1; i <= totalPeriods; i++) {
        const t = i / periodsPerYear;
        const cf = i === totalPeriods
          ? couponPerPeriod + faceValue
          : couponPerPeriod;
        const pv = cf * Math.exp(-yieldAnnual * t);
        // This cash flow contributes t × pv to duration numerator
        // Its DV01 contribution = t × pv × 0.0001 × quantity
        const cfDv01Contribution = t * pv * 0.0001 * quantity;

        // Distribute this DV01 contribution to buckets proportional to pv attribution
        // (using equal pv for weight since cfDv01 = t × pv × 0.0001, and t is the duration weight)
        const pvAttrib = attributeToBuckets(t, cfDv01Contribution);
        for (const [label, dv01Amt] of pvAttrib) {
          bucketDv01Direct.set(
            label,
            (bucketDv01Direct.get(label) ?? 0) + dv01Amt,
          );
        }
      }

      // Update net bucket totals
      for (const [label, dv01] of bucketDv01Direct) {
        netBucketDv01.set(label, (netBucketDv01.get(label) ?? 0) + dv01);
      }

      const contributions = KEY_RATE_BUCKETS.map((b) => ({
        bondIndex,
        tenorLabel: b.tenorLabel,
        dv01Contribution: bucketDv01Direct.get(b.tenorLabel) ?? 0,
      }));

      return {
        bondIndex,
        totalDv01,
        modifiedDuration: priceResult.modifiedDuration,
        contributions,
      };
    },
  );

  const totalPortfolioDv01 = positionResults.reduce(
    (sum, p) => sum + p.totalDv01,
    0,
  );

  const buckets = KEY_RATE_BUCKETS.map((b) => ({
    tenorLabel: b.tenorLabel,
    tenorYears: b.tenorYears,
    netDv01: netBucketDv01.get(b.tenorLabel) ?? 0,
  }));

  return {
    positions: positionResults,
    buckets,
    totalPortfolioDv01,
    computedAt: Date.now(),
  };
}
