/**
 * Fixed income bond pricing.
 *
 * Prices a bond as the present value of its coupon and principal cash flows
 * using continuous compounding. Computes modified duration, convexity, and DV01
 * via closed-form weighted sums — no numerical differentiation required.
 */

import type { BondPriceRequest, BondPriceResponse } from "./types.ts";

/**
 * Price a fixed-coupon bond and compute interest rate risk metrics.
 *
 * @param req.face            Face value (default 1000)
 * @param req.couponRate      Annual coupon rate, e.g. 0.05 = 5%
 * @param req.periodsPerYear  Coupon frequency, e.g. 2 = semi-annual (default 2)
 * @param req.totalPeriods    Total number of coupon periods, e.g. 20 = 10yr semi-annual
 * @param req.yieldAnnual     Current annual yield (continuous compounding), e.g. 0.045
 */
export function priceBond(req: BondPriceRequest): BondPriceResponse {
  const {
    face = 1000,
    couponRate,
    periodsPerYear = 2,
    totalPeriods,
    yieldAnnual,
  } = req;

  const couponPerPeriod = (couponRate * face) / periodsPerYear;
  const y = yieldAnnual;

  // Cash flows: coupons at each period + principal at final period
  const cashFlows: { t: number; cf: number; pv: number }[] = [];
  let price = 0;
  let durationNumer = 0; // Σ tᵢ × CF_pv_i
  let convexityNumer = 0; // Σ tᵢ² × CF_pv_i

  for (let i = 1; i <= totalPeriods; i++) {
    const t = i / periodsPerYear;
    const cf = i === totalPeriods ? couponPerPeriod + face : couponPerPeriod;
    const pv = cf * Math.exp(-y * t);
    cashFlows.push({ t, cf, pv });
    price += pv;
    durationNumer += t * pv;
    convexityNumer += t * t * pv;
  }

  const modifiedDuration = price > 0 ? durationNumer / price : 0;
  const convexity = price > 0 ? convexityNumer / price : 0;
  const dv01 = price * modifiedDuration * 0.0001;

  return {
    price,
    yieldAnnual,
    modifiedDuration,
    convexity,
    dv01,
    cashFlows,
    computedAt: Date.now(),
  };
}
