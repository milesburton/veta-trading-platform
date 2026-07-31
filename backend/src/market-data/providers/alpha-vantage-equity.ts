/**
 * Alpha Vantage provider — equity GLOBAL_QUOTE and FX CURRENCY_EXCHANGE_RATE.
 */

import { logger } from "@veta/logger";
import type { CachedQuote, ProviderDef } from "./types.ts";

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_KEY") ?? "";
const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";
const PROV = { provider: "alpha-vantage" };

async function fetchGlobalQuote(symbol: string): Promise<CachedQuote | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  try {
    logger.debug("polling GLOBAL_QUOTE", { ...PROV, symbol });
    const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${
      encodeURIComponent(
        symbol,
      )
    }&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, Record<string, string>>;
    const q = data["Global Quote"];
    if (!q?.["05. price"]) {
      logger.warn("no quote data (rate limit or invalid symbol?)", {
        ...PROV,
        symbol,
      });
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
    logger.warn("quote fetch failed", { ...PROV, symbol, err: err as Error });
    return null;
  }
}

async function fetchFxRate(symbol: string): Promise<CachedQuote | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  const [fromCurrency, toCurrency, ...extra] = symbol.split("/");
  if (!fromCurrency || !toCurrency || extra.length > 0) {
    logger.warn("invalid FX symbol format (expected BASE/QUOTE)", {
      ...PROV,
      symbol,
    });
    return null;
  }
  try {
    logger.debug("polling CURRENCY_EXCHANGE_RATE", { ...PROV, symbol });
    const url =
      `${ALPHA_VANTAGE_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${
        encodeURIComponent(
          fromCurrency,
        )
      }&to_currency=${
        encodeURIComponent(toCurrency)
      }&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, Record<string, string>>;
    const rate = data["Realtime Currency Exchange Rate"];
    if (!rate?.["5. Exchange Rate"]) {
      logger.warn("no rate data (rate limit or invalid pair?)", {
        ...PROV,
        symbol,
      });
      return null;
    }
    const price = Number.parseFloat(rate["5. Exchange Rate"]);
    if (price <= 0) return null;
    return {
      symbol,
      price,
      volume: 0,
      latestTradingDay: rate["6. Last Refreshed"] ??
        new Date().toISOString().slice(0, 10),
      fetchedAt: Date.now(),
      stale: false,
    };
  } catch (err) {
    logger.warn("rate fetch failed", { ...PROV, symbol, err: err as Error });
    return null;
  }
}

async function seedIntradayHistory(
  symbol: string,
  journalUrl: string,
): Promise<void> {
  if (!ALPHA_VANTAGE_KEY) return;
  try {
    logger.info("fetching intraday history", { ...PROV, symbol });
    const url = `${ALPHA_VANTAGE_BASE}?function=TIME_SERIES_INTRADAY&symbol=${
      encodeURIComponent(
        symbol,
      )
    }&interval=1min&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const series = data["Time Series (1min)"] as
      | Record<string, Record<string, string>>
      | undefined;
    if (!series) {
      logger.warn("no intraday data", { ...PROV, symbol });
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
      logger.info("seeded intraday candles into journal", {
        ...PROV,
        symbol,
        count: candles.length,
      });
    } else {
      logger.warn("journal seed non-OK response", {
        ...PROV,
        symbol,
        status: seedRes.status,
      });
    }
  } catch (err) {
    logger.warn("intraday seed failed", { ...PROV, symbol, err: err as Error });
  }
}

export const alphaVantageProvider: ProviderDef = {
  id: "alpha-vantage",
  label: "Alpha Vantage",
  description:
    "Real-world equity and FX quotes via Alpha Vantage. Free tier: 25 API calls/day. Prices polled every 5 minutes.",
  requiresApiKey: true,
  apiKeyConfigured: ALPHA_VANTAGE_KEY.length > 0,
  togglable: true,
  supportsSymbol(_symbol: string): boolean {
    return true;
  },
  async fetchQuote(
    symbol: string,
    _journalUrl: string,
  ): Promise<CachedQuote | null> {
    return symbol.includes("/")
      ? await fetchFxRate(symbol)
      : await fetchGlobalQuote(symbol);
  },
  async seedHistory(symbol: string, journalUrl: string): Promise<void> {
    if (!symbol.includes("/")) await seedIntradayHistory(symbol, journalUrl);
  },
};
