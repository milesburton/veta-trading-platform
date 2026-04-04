/**
 * Alpha Vantage equity provider — GLOBAL_QUOTE for non-FX symbols.
 */

import type { CachedQuote, ProviderDef } from "./types.ts";

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_KEY") ?? "";
const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";

async function fetchGlobalQuote(symbol: string): Promise<CachedQuote | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  try {
    console.log(`[alpha-vantage] Polling GLOBAL_QUOTE for ${symbol}`);
    const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${
      encodeURIComponent(symbol)
    }&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, Record<string, string>>;
    const q = data["Global Quote"];
    if (!q || !q["05. price"]) {
      console.warn(
        `[alpha-vantage] No quote data for ${symbol} — rate limit or invalid symbol?`,
      );
      return null;
    }
    const price = parseFloat(q["05. price"]);
    const volume = parseInt(q["06. volume"] ?? "0", 10);
    const latestTradingDay = q["07. latest trading day"] ?? "";
    if (price <= 0) return null;
    return {
      symbol,
      price,
      volume,
      latestTradingDay,
      fetchedAt: Date.now(),
      stale: false,
    };
  } catch (err) {
    console.warn(
      `[alpha-vantage] Quote fetch failed for ${symbol}: ${
        (err as Error).message
      }`,
    );
    return null;
  }
}

async function seedIntradayHistory(
  symbol: string,
  journalUrl: string,
): Promise<void> {
  if (!ALPHA_VANTAGE_KEY) return;
  try {
    console.log(`[alpha-vantage] Fetching intraday history for ${symbol}`);
    const url = `${ALPHA_VANTAGE_BASE}?function=TIME_SERIES_INTRADAY&symbol=${
      encodeURIComponent(symbol)
    }&interval=1min&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const series = data["Time Series (1min)"] as
      | Record<string, Record<string, string>>
      | undefined;
    if (!series) {
      console.warn(`[alpha-vantage] No intraday data for ${symbol}`);
      return;
    }

    const candles = Object.entries(series)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, bar]) => ({
        symbol,
        interval: "1m",
        ts: new Date(timestamp).getTime(),
        open: parseFloat(bar["1. open"]),
        high: parseFloat(bar["2. high"]),
        low: parseFloat(bar["3. low"]),
        close: parseFloat(bar["4. close"]),
        volume: parseInt(bar["5. volume"] ?? "0", 10),
      }));

    if (candles.length === 0) return;

    const seedRes = await fetch(`${journalUrl}/candles/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, candles }),
      signal: AbortSignal.timeout(15_000),
    });
    if (seedRes.ok) {
      console.log(
        `[alpha-vantage] Seeded ${candles.length} intraday candles for ${symbol} into journal`,
      );
    } else {
      console.warn(
        `[alpha-vantage] Journal seed returned ${seedRes.status} for ${symbol}`,
      );
    }
  } catch (err) {
    console.warn(
      `[alpha-vantage] Intraday seed failed for ${symbol}: ${
        (err as Error).message
      }`,
    );
  }
}

export const alphaVantageEquityProvider: ProviderDef = {
  id: "alpha-vantage",
  label: "Alpha Vantage",
  description:
    "Real-world market data via Alpha Vantage API. Free tier: 25 API calls/day. Prices polled every 5 minutes.",
  requiresApiKey: true,
  apiKeyConfigured: ALPHA_VANTAGE_KEY.length > 0,
  togglable: true,
  supportsSymbol(symbol: string): boolean {
    return !symbol.includes("/");
  },
  async fetchQuote(
    symbol: string,
    _journalUrl: string,
  ): Promise<CachedQuote | null> {
    return await fetchGlobalQuote(symbol);
  },
  async seedHistory(symbol: string, journalUrl: string): Promise<void> {
    await seedIntradayHistory(symbol, journalUrl);
  },
};
