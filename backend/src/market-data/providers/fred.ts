/**
 * FRED provider — US Treasury yield curve series.
 * Key: FRED_KEY (https://fred.stlouisfed.org/docs/api/ — free, no rate limit)
 *
 * Special: this provider does not participate in the per-symbol override system.
 * It exposes fetchYieldCurve() for use by the GET /fred/yield-curve endpoint.
 */

import type { CachedQuote, ProviderDef } from "./types.ts";

const FRED_KEY = Deno.env.get("FRED_KEY") ?? "";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const YIELD_CURVE_SERIES = [
  "DGS1MO",
  "DGS3MO",
  "DGS6MO",
  "DGS1",
  "DGS2",
  "DGS5",
  "DGS7",
  "DGS10",
  "DGS20",
  "DGS30",
] as const;

export type YieldCurveSeriesId = typeof YIELD_CURVE_SERIES[number];

export interface YieldCurvePoint {
  seriesId: string;
  value: number;
  date: string;
}

// 1-hour cache
const YIELD_CURVE_TTL_MS = 60 * 60 * 1_000;

let yieldCurveCache: Map<string, YieldCurvePoint> | null = null;
let yieldCurveFetchedAt = 0;

async function fetchOneSeries(seriesId: string): Promise<YieldCurvePoint | null> {
  try {
    const url =
      `${FRED_BASE}?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      observations?: { date: string; value: string }[];
    };
    const observations = data.observations ?? [];
    // Find the latest non-"." value
    for (const obs of observations) {
      if (obs.value !== ".") {
        const value = parseFloat(obs.value);
        if (!isNaN(value)) {
          return { seriesId, value, date: obs.date };
        }
      }
    }
    console.warn(`[fred] No valid observation for ${seriesId}`);
    return null;
  } catch (err) {
    console.warn(`[fred] Series fetch failed for ${seriesId}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fetch all 10 Treasury series. Returns a map of seriesId → YieldCurvePoint.
 * Caches results for 1 hour.
 */
export async function fetchYieldCurve(): Promise<Map<string, YieldCurvePoint>> {
  const now = Date.now();
  if (yieldCurveCache && now - yieldCurveFetchedAt < YIELD_CURVE_TTL_MS) {
    return yieldCurveCache;
  }

  if (!FRED_KEY) {
    console.warn(`[fred] FRED_KEY not configured — yield curve unavailable`);
    return new Map();
  }

  console.log(`[fred] Fetching yield curve (${YIELD_CURVE_SERIES.length} series)`);
  const results = await Promise.all(YIELD_CURVE_SERIES.map(fetchOneSeries));
  const map = new Map<string, YieldCurvePoint>();
  for (const point of results) {
    if (point) map.set(point.seriesId, point);
  }
  yieldCurveCache = map;
  yieldCurveFetchedAt = now;
  console.log(`[fred] Yield curve cached: ${map.size}/${YIELD_CURVE_SERIES.length} series`);
  return map;
}

/** ProviderDef instance — supportsSymbol always false (not per-symbol) */
export const fredProvider: ProviderDef = {
  id: "fred",
  label: "FRED",
  description:
    "US Federal Reserve Economic Data (FRED). Provides Treasury yield curve series. Not used for per-symbol overrides.",
  requiresApiKey: true,
  apiKeyConfigured: FRED_KEY.length > 0,
  togglable: false,
  supportsSymbol(_symbol: string): boolean {
    return false;
  },
  fetchQuote(_symbol: string, _journalUrl: string): Promise<CachedQuote | null> {
    return Promise.resolve(null);
  },
};
