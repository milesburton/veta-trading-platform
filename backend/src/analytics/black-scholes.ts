/**
 * Black-Scholes European option pricing with Greeks.
 *
 * Uses the Abramowitz & Stegun (1964) rational approximation for the
 * cumulative normal distribution (maximum error < 7.5e-8).
 */

import type { Greeks, OptionType } from "./types.ts";

const A1 = 0.254829592;
const A2 = -0.284496736;
const A3 = 1.421413741;
const A4 = -1.453152027;
const A5 = 1.061405429;
const P = 0.3275911;

/** Cumulative standard normal distribution N(x). */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + P * Math.abs(x));
  const y = ((((A5 * t + A4) * t + A3) * t + A2) * t + A1) * t;
  return 0.5 * (1.0 + sign * (1.0 - y * Math.exp(-x * x)));
}

/** Standard normal PDF φ(x). */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function d2(S: number, K: number, r: number, sigma: number, T: number): number {
  return d1(S, K, r, sigma, T) - sigma * Math.sqrt(T);
}

export interface BSResult {
  price: number;
  greeks: Greeks;
}

/**
 * Price a European option and compute Greeks.
 *
 * @param optionType - "call" or "put"
 * @param S          - current spot price
 * @param K          - strike price
 * @param T          - time to expiry in years
 * @param r          - risk-free rate (annual, e.g. 0.05)
 * @param sigma      - implied volatility (annual, e.g. 0.20)
 */
export function blackScholes(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): BSResult {
  // Edge cases
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsic = optionType === "call"
      ? Math.max(0, S - K)
      : Math.max(0, K - S);
    return {
      price: intrinsic,
      greeks: { delta: intrinsic > 0 ? (optionType === "call" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
    };
  }

  const _d1 = d1(S, K, r, sigma, T);
  const _d2 = d2(S, K, r, sigma, T);
  const Nd1 = normCdf(_d1);
  const Nd2 = normCdf(_d2);
  const nd1 = normPdf(_d1);
  const sqrtT = Math.sqrt(T);
  const discount = Math.exp(-r * T);

  let price: number;
  let delta: number;
  let rho: number;

  if (optionType === "call") {
    price = S * Nd1 - K * discount * Nd2;
    delta = Nd1;
    rho = K * T * discount * Nd2 / 100;
  } else {
    price = K * discount * (1 - Nd2) - S * (1 - Nd1);
    delta = Nd1 - 1;
    rho = -K * T * discount * (1 - Nd2) / 100;
  }

  // Shared Greeks
  const gamma = nd1 / (S * sigma * sqrtT);
  // Theta: per-day (divide annualised by 365)
  const theta = (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * discount * (optionType === "call" ? Nd2 : (1 - Nd2))) / 365;
  // Vega: per 1pp move in vol (divide annualised by 100)
  const vega = S * sqrtT * nd1 / 100;

  return { price, greeks: { delta, gamma, theta, vega, rho } };
}
