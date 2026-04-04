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

import type {
  ForwardRate,
  NelsonSiegelParams,
  YieldCurvePoint,
  YieldCurveResponse,
} from "./types.ts";

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
  { from: 1, to: 2, label: "1y→2y" },
  { from: 2, to: 3, label: "2y→3y" },
  { from: 3, to: 5, label: "3y→5y" },
  { from: 5, to: 10, label: "5y→10y" },
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
export function computeYieldCurve(
  params?: Partial<NelsonSiegelParams>,
): YieldCurvePoint[] {
  const p: NelsonSiegelParams = { ...DEFAULT_PARAMS, ...params };
  return TENORS.map(({ years, label }) => ({
    tenorYears: years,
    tenorLabel: label,
    spotRate: nelsonSiegel(years, p),
  }));
}

/**
 * Linearly interpolate a spot rate from the curve at tenor t (years).
 * Exported for use by spread-analysis and other modules.
 */
export function rateAt(curve: YieldCurvePoint[], t: number): number {
  const sorted = [...curve].sort((a, b) => a.tenorYears - b.tenorYears);
  if (t <= sorted[0].tenorYears) return sorted[0].spotRate;
  if (t >= sorted[sorted.length - 1].tenorYears) {
    return sorted[sorted.length - 1].spotRate;
  }
  const pair = sorted.slice(0, -1).find((lo, i) => {
    const hi = sorted[i + 1];
    return t >= lo.tenorYears && t <= hi.tenorYears;
  });
  if (!pair) return sorted[sorted.length - 1].spotRate;
  const hi = sorted[sorted.indexOf(pair) + 1];
  const w = (t - pair.tenorYears) / (hi.tenorYears - pair.tenorYears);
  return pair.spotRate + w * (hi.spotRate - pair.spotRate);
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
export function buildYieldCurveResponse(
  params?: Partial<NelsonSiegelParams>,
): YieldCurveResponse {
  const curve = computeYieldCurve(params);
  return {
    curve,
    forwardRates: forwardRates(curve),
    computedAt: Date.now(),
  };
}

// Fetches real US Treasury rates and fits Nelson-Siegel parameters.
// Falls back to DEFAULT_PARAMS if FRED_KEY is not set or the API is unavailable.

const FRED_SERIES: { id: string; tenor: number }[] = [
  { id: "DGS3MO", tenor: 0.25 },
  { id: "DGS6MO", tenor: 0.5 },
  { id: "DGS1", tenor: 1 },
  { id: "DGS2", tenor: 2 },
  { id: "DGS5", tenor: 5 },
  { id: "DGS10", tenor: 10 },
  { id: "DGS30", tenor: 30 },
];

let cachedFredParams: NelsonSiegelParams | Promise<NelsonSiegelParams> | null =
  null;
let fredCacheExpiry = 0;
const FRED_CACHE_MS = 6 * 60 * 60 * 1000;

async function fetchOneFredSeries(
  apiKey: string,
  seriesId: string,
): Promise<number | null> {
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&api_key=${apiKey}&file_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = await res.json() as { observations?: { value: string }[] };
    const raw = data.observations?.[0]?.value;
    if (!raw || raw === ".") return null;
    return parseFloat(raw) / 100; // FRED returns percent, convert to decimal
  } catch {
    return null;
  }
}

/**
 * Fit Nelson-Siegel params to observed (tenor, rate) pairs via grid search MSE.
 */
function fitNelsonSiegel(
  points: { tenor: number; rate: number }[],
): NelsonSiegelParams {
  const beta0Vals = [0.03, 0.035, 0.04, 0.045, 0.05, 0.055];
  const beta1Vals = [-0.03, -0.02, -0.01, 0.0, 0.01, 0.02];
  const beta2Vals = [-0.02, -0.01, 0.0, 0.01, 0.02, 0.03];
  const lambdaVals = [1.5, 2.0, 2.5, 3.0, 3.5];

  let best = DEFAULT_PARAMS;
  let bestMse = Infinity;

  for (const beta0 of beta0Vals) {
    for (const beta1 of beta1Vals) {
      for (const beta2 of beta2Vals) {
        for (const lambda of lambdaVals) {
          const p = { beta0, beta1, beta2, lambda };
          let mse = 0;
          for (const { tenor, rate } of points) {
            const pred = nelsonSiegel(tenor, p);
            mse += (pred - rate) ** 2;
          }
          mse /= points.length;
          if (mse < bestMse) {
            bestMse = mse;
            best = p;
          }
        }
      }
    }
  }
  return best;
}

import type { YieldCurveStore } from "./yield-curve-store.ts";

/**
 * Fetch real US Treasury rates from FRED and fit Nelson-Siegel parameters.
 * Returns cached params (6-hour TTL) or DEFAULT_PARAMS if unavailable.
 * Optionally persists the fitted snapshot to a YieldCurveStore for backtesting.
 */
export function fetchFredParams(
  store?: YieldCurveStore,
): Promise<NelsonSiegelParams> {
  if (cachedFredParams instanceof Promise) return cachedFredParams;
  if (cachedFredParams !== null && Date.now() < fredCacheExpiry) {
    return Promise.resolve(cachedFredParams);
  }

  const apiKey = Deno.env.get("FRED_KEY");
  if (!apiKey) return Promise.resolve(DEFAULT_PARAMS);

  const fetchPromise = (async (): Promise<NelsonSiegelParams> => {
    const results = await Promise.all(
      FRED_SERIES.map(async ({ id, tenor }) => {
        const rate = await fetchOneFredSeries(apiKey, id);
        return rate !== null ? { tenor, rate } : null;
      }),
    );

    const points = results.filter((p): p is { tenor: number; rate: number } =>
      p !== null
    );
    if (points.length < 3) return DEFAULT_PARAMS;

    const params = fitNelsonSiegel(points);
    cachedFredParams = params;
    fredCacheExpiry = Date.now() + FRED_CACHE_MS;

    if (store) {
      store.insertSnapshot(params, "fred").catch(() => {});
    }

    return params;
  })();

  cachedFredParams = fetchPromise;
  return fetchPromise.catch((err) => {
    cachedFredParams = null;
    throw err;
  });
}
