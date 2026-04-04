/**
 * Fixed income spread analysis.
 *
 * Computes Z-spread, G-spread, and OAS for a fixed-coupon bond relative
 * to the Nelson-Siegel risk-free curve.
 *
 *   G-spread = bondYield − govSpotRate(sameTenor)   [basis points]
 *   Z-spread = parallel shift to curve so PV(CFs) = dirtyprice  [bps]
 *   OAS      = Z-spread (vanilla bond: no embedded optionality)
 */

import { priceBond } from "./bond-pricing.ts";
import type { NelsonSiegelParams } from "./types.ts";
import { computeYieldCurve } from "./yield-curve.ts";
import type { YieldCurvePoint } from "./types.ts";

export interface SpreadAnalysisRequest {
  couponRate: number; // annual coupon rate, e.g. 0.05
  totalPeriods: number; // total coupon periods
  periodsPerYear?: number; // coupon frequency, default 2
  yieldAnnual: number; // bond's current yield
  face?: number; // face value, default 1000
  nsParams?: Partial<NelsonSiegelParams>;
}

export interface SpreadAnalysisResponse {
  bondYield: number; // input yield
  tenorYears: number; // bond maturity in years
  govSpotRate: number; // interpolated Nelson-Siegel rate at same tenor
  gSpread: number; // G-spread in basis points
  zSpread: number; // Z-spread in basis points
  oas: number; // OAS in basis points (= zSpread for vanilla bonds)
  computedAt: number;
}

/**
 * Linearly interpolate a rate from a spot curve at tenor t (years).
 * Exported for use by duration-ladder and other modules.
 */
export function rateAt(curve: YieldCurvePoint[], t: number): number {
  const sorted = [...curve].sort((a, b) => a.tenorYears - b.tenorYears);
  if (t <= sorted[0].tenorYears) return sorted[0].spotRate;
  if (t >= sorted[sorted.length - 1].tenorYears) {
    return sorted[sorted.length - 1].spotRate;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (t >= lo.tenorYears && t <= hi.tenorYears) {
      const w = (t - lo.tenorYears) / (hi.tenorYears - lo.tenorYears);
      return lo.spotRate + w * (hi.spotRate - lo.spotRate);
    }
  }
  return sorted[sorted.length - 1].spotRate;
}

/**
 * Compute Z-spread via bisection search.
 *
 * Finds z such that: Σ CF_i × exp(-(r(tᵢ) + z) × tᵢ) = bondPrice
 * where r(tᵢ) is the Nelson-Siegel spot rate at cash flow time tᵢ.
 *
 * Bisects on z in [-0.02, 0.10] with 40 iterations for tight convergence.
 */
function computeZSpread(
  cashFlows: { t: number; cf: number }[],
  bondPrice: number,
  curve: YieldCurvePoint[],
): number {
  function pvAtSpread(z: number): number {
    let pv = 0;
    for (const { t, cf } of cashFlows) {
      const r = rateAt(curve, t);
      pv += cf * Math.exp(-(r + z) * t);
    }
    return pv;
  }

  let lo = -0.02;
  let hi = 0.20;

  // Expand hi if needed (very high yield / distressed scenario)
  if (pvAtSpread(hi) > bondPrice) hi = 0.50;

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    const pv = pvAtSpread(mid);
    if (Math.abs(pv - bondPrice) < 1e-8) break;
    if (pv > bondPrice) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2;
}

export function computeSpreadAnalysis(
  req: SpreadAnalysisRequest,
): SpreadAnalysisResponse {
  const {
    couponRate,
    totalPeriods,
    periodsPerYear = 2,
    yieldAnnual,
    face = 1000,
    nsParams,
  } = req;

  const tenorYears = totalPeriods / periodsPerYear;

  // Build the risk-free spot curve
  const curve = computeYieldCurve(nsParams);

  // Government spot rate at same maturity (linear interpolation)
  const govSpotRate = rateAt(curve, tenorYears);

  // G-spread = bond yield minus gov spot rate (basis points)
  const gSpread = (yieldAnnual - govSpotRate) * 10_000;

  // Bond price from DCF (needed for Z-spread solve)
  const bondResult = priceBond({
    couponRate,
    totalPeriods,
    periodsPerYear,
    yieldAnnual,
    face,
  });

  // Build raw cash flow schedule (without PV — we'll discount differently for Z-spread)
  const couponPerPeriod = (couponRate * face) / periodsPerYear;
  const cashFlows: { t: number; cf: number }[] = Array.from({
    length: totalPeriods,
  }, (_, i) => {
    const period = i + 1;
    const t = period / periodsPerYear;
    const cf = period === totalPeriods
      ? couponPerPeriod + face
      : couponPerPeriod;
    return { t, cf };
  });

  // Z-spread via bisection
  const zSpreadDecimal = computeZSpread(cashFlows, bondResult.price, curve);
  const zSpread = zSpreadDecimal * 10_000; // convert to basis points

  // OAS = Z-spread for vanilla bonds (no embedded optionality)
  const oas = zSpread;

  return {
    bondYield: yieldAnnual,
    tenorYears,
    govSpotRate,
    gSpread,
    zSpread,
    oas,
    computedAt: Date.now(),
  };
}
