/**
 * Tiingo provider — REST quotes for equities and FX.
 * Key: TIINGO_KEY (https://api.tiingo.com — free tier)
 */

import type { CachedQuote, ProviderDef } from "./types.ts";

const TIINGO_KEY = Deno.env.get("TIINGO_KEY") ?? "";

async function fetchTiingoEquity(symbol: string): Promise<CachedQuote | null> {
  try {
    console.log(`[tiingo] Polling IEX quote for ${symbol}`);
    const url =
      `https://api.tiingo.com/iex/${symbol.toLowerCase()}?token=${TIINGO_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { last?: number; lastSaleTimestamp?: string }[];
    if (!Array.isArray(data) || data.length === 0 || data[0].last == null) {
      console.warn(`[tiingo] No equity data for ${symbol}`);
      return null;
    }
    const price = data[0].last!;
    const latestTradingDay = data[0].lastSaleTimestamp
      ? data[0].lastSaleTimestamp.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (price <= 0) return null;
    return { symbol, price, volume: 0, latestTradingDay, fetchedAt: Date.now(), stale: false };
  } catch (err) {
    console.warn(`[tiingo] Equity fetch failed for ${symbol}: ${(err as Error).message}`);
    return null;
  }
}

async function fetchTiingoFx(symbol: string): Promise<CachedQuote | null> {
  // Reformat e.g. "EUR/USD" → "eurusd"
  const pair = symbol.replace("/", "").toLowerCase();
  try {
    console.log(`[tiingo] Polling FX top for ${symbol}`);
    const url =
      `https://api.tiingo.com/tiingo/fx/${pair}/top?token=${TIINGO_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { midPrice?: number }[];
    if (!Array.isArray(data) || data.length === 0 || data[0].midPrice == null) {
      console.warn(`[tiingo] No FX data for ${symbol}`);
      return null;
    }
    const price = data[0].midPrice!;
    const latestTradingDay = new Date().toISOString().slice(0, 10);
    if (price <= 0) return null;
    return { symbol, price, volume: 0, latestTradingDay, fetchedAt: Date.now(), stale: false };
  } catch (err) {
    console.warn(`[tiingo] FX fetch failed for ${symbol}: ${(err as Error).message}`);
    return null;
  }
}

export const tiingoProvider: ProviderDef = {
  id: "tiingo",
  label: "Tiingo",
  description:
    "Real-world equity and FX quotes via Tiingo REST API. Free tier: daily data.",
  requiresApiKey: true,
  apiKeyConfigured: TIINGO_KEY.length > 0,
  togglable: true,
  supportsSymbol(_symbol: string): boolean {
    return true;
  },
  async fetchQuote(symbol: string, _journalUrl: string): Promise<CachedQuote | null> {
    if (!TIINGO_KEY) return null;
    if (symbol.includes("/")) {
      return await fetchTiingoFx(symbol);
    }
    return await fetchTiingoEquity(symbol);
  },
};
