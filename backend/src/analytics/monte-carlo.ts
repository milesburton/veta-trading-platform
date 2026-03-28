/**
 * Monte Carlo simulation for option price distribution.
 *
 * Uses single-step Geometric Brownian Motion with a seeded LCG for
 * deterministic results given the same inputs. Employs antithetic variates
 * (pairing z and -z) to halve estimator variance at no additional cost.
 */

import type { OptionType } from "./types.ts";

/** Linear congruential generator — Park-Miller parameters. */
export function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return ((s >>> 0) / 0xffffffff);
  };
}

/**
 * Simple hash of a string to a uint32 seed.
 * djb2 variant — good enough for seeding Monte Carlo.
 */
export function hashSeed(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

/** Generate a standard normal sample from two uniform(0,1) samples. */
export function boxMuller(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(u1 + 1e-15)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: Float64Array, p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface MonteCarloResult {
  p5: number;
  p25: number;
  mean: number;
  p75: number;
  p95: number;
}

/**
 * Run a single-step GBM Monte Carlo simulation for an option.
 *
 * @param optionType - "call" or "put"
 * @param S          - spot price
 * @param K          - strike price
 * @param T          - time to expiry in years
 * @param r          - risk-free rate (annual)
 * @param sigma      - volatility (annual)
 * @param paths      - number of simulation paths (default 5000; must be even)
 * @param seedKey    - deterministic seed string (e.g. "AAPL-150-3600")
 */
export function monteCarlo(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  paths = 5000,
  seedKey = "",
): MonteCarloResult {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = optionType === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
    return { p5: intrinsic, p25: intrinsic, mean: intrinsic, p75: intrinsic, p95: intrinsic };
  }

  // Ensure paths is even for antithetic pairing
  const n = paths % 2 === 0 ? paths : paths + 1;

  const rand = makeLcg(hashSeed(seedKey || `${optionType}-${S}-${K}-${T}`));
  const discount = Math.exp(-r * T);
  const drift = (r - 0.5 * sigma * sigma) * T;
  const diffusion = sigma * Math.sqrt(T);

  const prices = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    // Antithetic variates: use z and -z to reduce variance
    const z = boxMuller(rand(), rand());
    const zAnt = -z;

    const ST = S * Math.exp(drift + diffusion * z);
    const STa = S * Math.exp(drift + diffusion * zAnt);
    prices[i] = (optionType === "call" ? Math.max(0, ST - K) : Math.max(0, K - ST)) * discount;
    prices[i + 1] = (optionType === "call" ? Math.max(0, STa - K) : Math.max(0, K - STa)) * discount;
  }

  prices.sort();

  const mean = prices.reduce((a, b) => a + b, 0) / n;

  return {
    p5: percentile(prices, 5),
    p25: percentile(prices, 25),
    mean,
    p75: percentile(prices, 75),
    p95: percentile(prices, 95),
  };
}
