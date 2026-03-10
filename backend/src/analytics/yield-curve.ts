/**
 * Nelson-Siegel yield curve model.
 *
 * Computes a parametric spot yield curve and implied instantaneous forward rates.
 *
 * Nelson-Siegel formula:
 *   R(τ) = β₀ + β₁ × (1-e^(-τ/λ))/(τ/λ) + β₂ × ((1-e^(-τ/λ))/(τ/λ) - e^(-τ/λ))
 *
 * Default parameters simulate a plausible near-current US Treasury curve:
 *   β₀ = 0.045 — long-run level (~4.5%)
 *   β₁ = -0.015 — slope (negative → slightly inverted short end)
 *   β₂ = 0.010  — curvature (hump around the belly)
 *   λ  = 2.5    — time constant (years)
 */

import type { ForwardRate, NelsonSiegelParams, YieldCurvePoint, YieldCurveResponse } from "./types.ts";

const DEFAULT_PARAMS: NelsonSiegelParams = {
  beta0: 0.045,
  beta1: -0.015,
  beta2: 0.010,
  lambda: 2.5,
};

const TENORS: { years: number; label: string }[] = [
  { years: 0.25, label: "3m" },
  { years: 0.50, label: "6m" },
  { years: 1.00, label: "1y" },
  { years: 2.00, label: "2y" },
  { years: 3.00, label: "3y" },
  { years: 5.00, label: "5y" },
  { years: 7.00, label: "7y" },
  { years: 10.0, label: "10y" },
  { years: 20.0, label: "20y" },
  { years: 30.0, label: "30y" },
];

// Pairs of (from, to) tenors for the forward rate table
const FORWARD_PAIRS: { from: number; to: number; label: string }[] = [
  { from: 1,  to: 2,  label: "1y→2y" },
  { from: 2,  to: 3,  label: "2y→3y" },
  { from: 3,  to: 5,  label: "3y→5y" },
  { from: 5,  to: 10, label: "5y→10y" },
  { from: 10, to: 20, label: "10y→20y" },
];

/** Nelson-Siegel spot rate for a given tenor in years. */
function nelsonSiegel(tau: number, p: NelsonSiegelParams): number {
  const { beta0, beta1, beta2, lambda } = p;
  if (tau <= 0) return beta0 + beta1;
  const x = tau / lambda;
  const factor1 = (1 - Math.exp(-x)) / x;
  const factor2 = factor1 - Math.exp(-x);
  return beta0 + beta1 * factor1 + beta2 * factor2;
}

/**
 * Compute the full spot yield curve using Nelson-Siegel.
 * Accepts optional parameter overrides — any missing params use the defaults.
 */
export function computeYieldCurve(params?: Partial<NelsonSiegelParams>): YieldCurvePoint[] {
  const p: NelsonSiegelParams = { ...DEFAULT_PARAMS, ...params };
  return TENORS.map(({ years, label }) => ({
    tenorYears: years,
    tenorLabel: label,
    spotRate: nelsonSiegel(years, p),
  }));
}

/**
 * Derive implied forward rates from a spot curve.
 * Uses continuous compounding: f(t₁,t₂) = (R(t₂)×t₂ - R(t₁)×t₁) / (t₂ - t₁)
 */
/**
 * Linearly interpolate a spot rate from the curve at tenor t (years).
 * Exported for use by spread-analysis and other modules.
 */
export function rateAt(curve: YieldCurvePoint[], t: number): number {
  const sorted = [...curve].sort((a, b) => a.tenorYears - b.tenorYears);
  if (t <= sorted[0].tenorYears) return sorted[0].spotRate;
  if (t >= sorted[sorted.length - 1].tenorYears) return sorted[sorted.length - 1].spotRate;
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

export function forwardRates(curve: YieldCurvePoint[]): ForwardRate[] {
  return FORWARD_PAIRS.map(({ from, to, label }) => {
    const r1 = rateAt(curve, from);
    const r2 = rateAt(curve, to);
    const rate = (r2 * to - r1 * from) / (to - from);
    return { fromYears: from, toYears: to, label, rate };
  });
}

/** Build a full YieldCurveResponse from optional parameter overrides. */
export function buildYieldCurveResponse(params?: Partial<NelsonSiegelParams>): YieldCurveResponse {
  const curve = computeYieldCurve(params);
  return {
    curve,
    forwardRates: forwardRates(curve),
    computedAt: Date.now(),
  };
}
