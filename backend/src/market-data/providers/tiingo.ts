/**
 * Tiingo provider — REST quotes for equities and FX.
 * Key: TIINGO_KEY (https://api.tiingo.com — free tier)
 */

import type { CachedQuote, ProviderDef } from "./types.ts";
import { logger } from "@veta/logger";

const TIINGO_KEY = Deno.env.get("TIINGO_KEY") ?? "";
const PROV = { provider: "tiingo" };

async function fetchTiingoEquity(symbol: string): Promise<CachedQuote | null> {
  try {
    logger.debug("polling IEX quote", { ...PROV, symbol });
    const url =
      `https://api.tiingo.com/iex/${symbol.toLowerCase()}?token=${TIINGO_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      last?: number;
      lastSaleTimestamp?: string;
    }[];
    if (!Array.isArray(data) || data.length === 0 || data[0].last == null) {
      logger.warn("no equity data", { ...PROV, symbol });
      return null;
    }
    const price = data[0].last!;
    const latestTradingDay = data[0].lastSaleTimestamp
      ? data[0].lastSaleTimestamp.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
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
    logger.warn("equity fetch failed", { ...PROV, symbol, err: err as Error });
    return null;
  }
}

async function fetchTiingoFx(symbol: string): Promise<CachedQuote | null> {
  // Reformat e.g. "EUR/USD" → "eurusd"
  const pair = symbol.replace("/", "").toLowerCase();
  try {
    logger.debug("polling FX top", { ...PROV, symbol });
    const url =
      `https://api.tiingo.com/tiingo/fx/${pair}/top?token=${TIINGO_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { midPrice?: number }[];
    if (!Array.isArray(data) || data.length === 0 || data[0].midPrice == null) {
      logger.warn("no FX data", { ...PROV, symbol });
      return null;
    }
    const price = data[0].midPrice!;
    const latestTradingDay = new Date().toISOString().slice(0, 10);
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
    logger.warn("FX fetch failed", { ...PROV, symbol, err: err as Error });
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
  async fetchQuote(
    symbol: string,
    _journalUrl: string,
  ): Promise<CachedQuote | null> {
    if (!TIINGO_KEY) return null;
    if (symbol.includes("/")) {
      return await fetchTiingoFx(symbol);
    }
    return await fetchTiingoEquity(symbol);
  },
};
