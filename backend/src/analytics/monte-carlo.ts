/**
 * Monte Carlo simulation for option price distribution.
 *
 * Uses single-step Geometric Brownian Motion with a seeded LCG for
 * deterministic results given the same inputs.
 */

import type { OptionType } from "./types.ts";

// ── Seeded LCG PRNG ───────────────────────────────────────────────────────────

/** Linear congruential generator — Park-Miller parameters. */
function makeLcg(seed: number): () => number {
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
function hashSeed(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 33) ^ key.charCodeAt(i)) >>> 0;
  }
  return h || 1;
}

// ── Box-Muller transform ──────────────────────────────────────────────────────

/** Generate a standard normal sample from two uniform(0,1) samples. */
function boxMuller(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(u1 + 1e-15)) * Math.cos(2 * Math.PI * u2);
}

// ── Percentiles ───────────────────────────────────────────────────────────────

function percentile(sorted: Float64Array, p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Public API ────────────────────────────────────────────────────────────────

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
 * @param paths      - number of simulation paths (default 1000)
 * @param seedKey    - deterministic seed string (e.g. "AAPL-150-3600")
 */
export function monteCarlo(
  optionType: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  paths = 1000,
  seedKey = "",
): MonteCarloResult {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = optionType === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
    return { p5: intrinsic, p25: intrinsic, mean: intrinsic, p75: intrinsic, p95: intrinsic };
  }

  const rand = makeLcg(hashSeed(seedKey || `${optionType}-${S}-${K}-${T}`));
  const discount = Math.exp(-r * T);
  const drift = (r - 0.5 * sigma * sigma) * T;
  const diffusion = sigma * Math.sqrt(T);

  const prices = new Float64Array(paths);
  for (let i = 0; i < paths; i += 2) {
    const z1 = boxMuller(rand(), rand());
    const z2 = i + 1 < paths ? boxMuller(rand(), rand()) : z1;

    for (let j = 0; j < 2 && i + j < paths; j++) {
      const z = j === 0 ? z1 : z2;
      const ST = S * Math.exp(drift + diffusion * z);
      const payoff = optionType === "call" ? Math.max(0, ST - K) : Math.max(0, K - ST);
      prices[i + j] = payoff * discount;
    }
  }

  prices.sort();

  const mean = prices.reduce((a, b) => a + b, 0) / paths;

  return {
    p5: percentile(prices, 5),
    p25: percentile(prices, 25),
    mean,
    p75: percentile(prices, 75),
    p95: percentile(prices, 95),
  };
}
