/**
 * Volatility estimation from historical candle data.
 *
 * Uses 120 1-minute candles from the journal service.
 * Primary estimator: EWMA (RiskMetrics λ=0.94) — gives more weight to
 * recent returns than a simple rolling std-dev, making it responsive to
 * regime changes while remaining smooth.
 * Secondary: simple rolling std-dev, returned for reference.
 */

import type { VolProfileSample } from "./types.ts";

// 252 trading days × 390 1-minute bars per day
const ANNUAL_FACTOR = Math.sqrt(252 * 390);

// RiskMetrics EWMA decay factor
const LAMBDA = 0.94;

interface VolCacheEntry {
  ewmaVol: number;
  rollingVol: number;
  ewmaSeries: VolProfileSample[];
  expiresAt: number;
}

// Cache volatility estimates for 60 seconds to avoid hammering the journal
const volCache = new Map<string, VolCacheEntry>();

// ── Core computation ──────────────────────────────────────────────────────────

interface VolResult {
  ewmaVol: number;
  rollingVol: number;
  ewmaSeries: VolProfileSample[];
}

function computeVol(closes: number[], timestamps: number[]): VolResult {
  // Compute log returns
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const n = logReturns.length;

  // ── EWMA variance ────────────────────────────────────────────────────────
  // Seed with first squared return; iterate forward applying λ decay
  let ewmaVar = logReturns[0] * logReturns[0];
  const ewmaSeries: VolProfileSample[] = [];
  for (let i = 0; i < n; i++) {
    ewmaVar = LAMBDA * ewmaVar + (1 - LAMBDA) * logReturns[i] * logReturns[i];
    const annualisedVol = Math.min(5.0, Math.max(0.01, Math.sqrt(ewmaVar) * ANNUAL_FACTOR));
    ewmaSeries.push({ ts: timestamps[i + 1], vol: annualisedVol });
  }
  const ewmaVol = ewmaSeries[ewmaSeries.length - 1].vol;

  // ── Rolling (sample) std-dev ─────────────────────────────────────────────
  const mean = logReturns.reduce((a, b) => a + b, 0) / n;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const rollingVol = Math.min(5.0, Math.max(0.01, Math.sqrt(variance) * ANNUAL_FACTOR));

  return { ewmaVol, rollingVol, ewmaSeries };
}

// ── Fetch candles helper ──────────────────────────────────────────────────────

async function fetchCandles(
  journalUrl: string,
  symbol: string,
): Promise<{ close: number; ts?: number }[] | null> {
  try {
    const url = `${journalUrl}/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=120`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    return await res.json() as { close: number; ts?: number }[];
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Estimate annualised EWMA volatility for a symbol (scalar).
 * Backward-compatible with previous `estimateVol()` callers.
 *
 * @param journalUrl - base URL of the journal service
 * @param symbol     - asset symbol (e.g. "AAPL")
 * @param fallback   - vol to use if not enough data (default 0.25)
 */
export async function estimateVol(
  journalUrl: string,
  symbol: string,
  fallback = 0.25,
): Promise<number> {
  const now = Date.now();
  const cached = volCache.get(symbol);
  if (cached && cached.expiresAt > now) return cached.ewmaVol;

  const candles = await fetchCandles(journalUrl, symbol);
  if (!candles || candles.length < 2) {
    if (cached) return cached.ewmaVol;
    return fallback;
  }

  const closes = candles.map((c) => c.close).filter((v) => v > 0);
  if (closes.length < 2) {
    if (cached) return cached.ewmaVol;
    return fallback;
  }

  // Use candle index as synthetic timestamp if ts field absent
  const baseTs = Date.now() - candles.length * 60_000;
  const timestamps = candles.map((c, i) => c.ts ?? (baseTs + i * 60_000));

  const result = computeVol(closes, timestamps);
  volCache.set(symbol, { ...result, expiresAt: now + 60_000 });
  return result.ewmaVol;
}

/**
 * Return the full EWMA vol profile for charting.
 * Returns null if there is insufficient candle data.
 *
 * @param journalUrl - base URL of the journal service
 * @param symbol     - asset symbol
 */
export async function estimateVolProfile(
  journalUrl: string,
  symbol: string,
): Promise<{ ewmaVol: number; rollingVol: number; ewmaSeries: VolProfileSample[] } | null> {
  const now = Date.now();
  const cached = volCache.get(symbol);
  if (cached && cached.expiresAt > now) {
    return { ewmaVol: cached.ewmaVol, rollingVol: cached.rollingVol, ewmaSeries: cached.ewmaSeries };
  }

  const candles = await fetchCandles(journalUrl, symbol);
  if (!candles || candles.length < 2) return null;

  const closes = candles.map((c) => c.close).filter((v) => v > 0);
  if (closes.length < 2) return null;

  const baseTs = Date.now() - candles.length * 60_000;
  const timestamps = candles.map((c, i) => c.ts ?? (baseTs + i * 60_000));

  const result = computeVol(closes, timestamps);
  volCache.set(symbol, { ...result, expiresAt: now + 60_000 });
  return result;
}

/**
 * Fetch the latest spot price for a symbol from the journal's most recent candle.
 *
 * @param journalUrl - base URL of the journal service
 * @param symbol     - asset symbol
 */
export async function fetchSpotPrice(journalUrl: string, symbol: string): Promise<number | null> {
  try {
    const url = `${journalUrl}/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const candles = await res.json() as { close: number }[];
    if (candles.length === 0 || candles[0].close <= 0) return null;
    return candles[0].close;
  } catch {
    return null;
  }
}
