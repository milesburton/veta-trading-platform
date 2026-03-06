/**
 * Volatility estimation from historical candle data.
 *
 * Uses 120 1-minute candles from the journal service, computes
 * log-return standard deviation and annualises by sqrt(252 * 390).
 */

// 252 trading days × 390 1-minute bars per day
const ANNUAL_FACTOR = Math.sqrt(252 * 390);

// Cache volatility estimates for 60 seconds to avoid hammering the journal
const volCache = new Map<string, { vol: number; expiresAt: number }>();

/**
 * Estimate annualised volatility for a symbol from 1-minute candles.
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
  if (cached && cached.expiresAt > now) return cached.vol;

  try {
    const url = `${journalUrl}/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=120`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Journal returned ${res.status}`);

    const candles = await res.json() as { close: number }[];
    if (candles.length < 2) throw new Error("Not enough candles");

    const closes = candles.map((c) => c.close).filter((v) => v > 0);
    if (closes.length < 2) throw new Error("Not enough valid closes");

    // Compute log returns
    const logReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }

    // Sample std dev
    const n = logReturns.length;
    const mean = logReturns.reduce((a, b) => a + b, 0) / n;
    const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
    const vol = Math.sqrt(variance) * ANNUAL_FACTOR;

    // Clamp to [0.01, 5.0] — avoid nonsensical estimates
    const clampedVol = Math.min(5.0, Math.max(0.01, vol));
    volCache.set(symbol, { vol: clampedVol, expiresAt: now + 60_000 });
    return clampedVol;
  } catch {
    // Return cached value (even if expired) before falling back to default
    if (cached) return cached.vol;
    return fallback;
  }
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
