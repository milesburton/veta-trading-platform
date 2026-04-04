/**
 * Alpha Vantage FX provider — CURRENCY_EXCHANGE_RATE for symbols containing "/".
 */

import type { CachedQuote, ProviderDef } from "./types.ts";

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_KEY") ?? "";
const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";

async function fetchFxRate(symbol: string): Promise<CachedQuote | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  const parts = symbol.split("/");
  if (parts.length !== 2) {
    console.warn(
      `[alpha-vantage-fx] Invalid FX symbol format: ${symbol} (expected BASE/QUOTE)`,
    );
    return null;
  }
  const [fromCurrency, toCurrency] = parts;
  try {
    console.log(
      `[alpha-vantage-fx] Polling CURRENCY_EXCHANGE_RATE for ${symbol}`,
    );
    const url =
      `${ALPHA_VANTAGE_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${
        encodeURIComponent(fromCurrency)
      }&to_currency=${
        encodeURIComponent(toCurrency)
      }&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, Record<string, string>>;
    const rate = data["Realtime Currency Exchange Rate"];
    if (!rate || !rate["5. Exchange Rate"]) {
      console.warn(
        `[alpha-vantage-fx] No rate data for ${symbol} — rate limit or invalid pair?`,
      );
      return null;
    }
    const price = parseFloat(rate["5. Exchange Rate"]);
    const latestTradingDay = rate["6. Last Refreshed"] ??
      new Date().toISOString().slice(0, 10);
    if (price <= 0) return null;
    return {
      symbol,
      price,
      volume: 0,
      latestTradingDay,
      fetchedAt: Date.now(),
      stale: false,
    };
  } catch (err) {
    console.warn(
      `[alpha-vantage-fx] Rate fetch failed for ${symbol}: ${
        (err as Error).message
      }`,
    );
    return null;
  }
}

export const alphaVantageFxProvider: ProviderDef = {
  id: "alpha-vantage-fx",
  label: "Alpha Vantage FX",
  description:
    "Real-world FX rates via Alpha Vantage CURRENCY_EXCHANGE_RATE endpoint. Same free-tier key as equity feed.",
  requiresApiKey: true,
  apiKeyConfigured: ALPHA_VANTAGE_KEY.length > 0,
  togglable: true,
  supportsSymbol(symbol: string): boolean {
    return symbol.includes("/");
  },
  async fetchQuote(
    symbol: string,
    _journalUrl: string,
  ): Promise<CachedQuote | null> {
    return await fetchFxRate(symbol);
  },
};
