/**
 * Multi-step GBM price fan chart.
 *
 * Simulates forward equity price paths using Geometric Brownian Motion across
 * N discrete time steps. At each step the p5/p25/p50/p75/p95 quantiles of the
 * simulated price distribution are returned for fan-chart visualisation.
 *
 * Reuses the seeded LCG + Box-Muller helpers from monte-carlo.ts to ensure
 * deterministic, variance-reduced output.
 */

import { boxMuller, hashSeed, makeLcg } from "./monte-carlo.ts";
import type { PriceFanStep } from "./types.ts";

function percentile(sorted: Float64Array, p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Run a multi-step GBM simulation and return per-step price quantiles.
 *
 * @param S        Current spot price
 * @param sigma    Annualised volatility
 * @param r        Annual risk-free rate
 * @param steps    Number of forward steps
 * @param stepSecs Duration of each step in seconds
 * @param paths    Number of simulation paths (forced even for antithetic variates)
 * @param seedKey  Deterministic seed string
 */
export function priceFan(
  S: number,
  sigma: number,
  r: number,
  steps: number,
  stepSecs: number,
  paths: number,
  seedKey: string,
): PriceFanStep[] {
  // Ensure paths is even for antithetic pairing
  const n = paths % 2 === 0 ? paths : paths + 1;
  const dt = stepSecs / (365 * 86400);
  const drift = (r - 0.5 * sigma * sigma) * dt;
  const diffusion = sigma * Math.sqrt(dt);

  const rand = makeLcg(
    hashSeed(seedKey || `fan-${S}-${sigma}-${steps}-${stepSecs}`),
  );

  // Initialise all paths at spot
  const currentPrices = new Float64Array(n).fill(S);

  const result: PriceFanStep[] = [];

  for (let step = 1; step <= steps; step++) {
    // Advance each path by one dt using antithetic variates
    for (let i = 0; i < n; i += 2) {
      const z = boxMuller(rand(), rand());
      currentPrices[i] = currentPrices[i] * Math.exp(drift + diffusion * z);
      currentPrices[i + 1] = currentPrices[i + 1] *
        Math.exp(drift + diffusion * -z);
    }

    // Snapshot sorted copy for percentile computation
    const snapshot = currentPrices.slice().sort();

    result.push({
      step,
      tSecs: step * stepSecs,
      p5: percentile(snapshot, 5),
      p25: percentile(snapshot, 25),
      p50: percentile(snapshot, 50),
      p75: percentile(snapshot, 75),
      p95: percentile(snapshot, 95),
    });
  }

  return result;
}
