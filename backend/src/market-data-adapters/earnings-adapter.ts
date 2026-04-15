import type { MarketAdapterEvent } from "@veta/types/intelligence";
import { logger } from "@veta/logger";

const IMPACT_ROTATION: Array<"high" | "medium" | "low"> = [
  "high",
  "medium",
  "medium",
  "low",
];

interface FinnhubEarning {
  symbol: string;
  date: string; // "YYYY-MM-DD"
  epsEstimate: number | null;
  epsActual: number | null;
  quarter: number | null;
  year: number | null;
}

function deriveImpact(
  actual: number | null,
  estimate: number | null,
): "high" | "medium" | "low" {
  if (actual == null || estimate == null || estimate === 0) return "medium";
  const beatPct = Math.abs((actual - estimate) / Math.abs(estimate));
  if (beatPct >= 0.15) return "high";
  if (beatPct >= 0.05) return "medium";
  return "low";
}

async function fetchFinnhubEarnings(
  apiKey: string,
  symbols: string[],
): Promise<Map<string, FinnhubEarning[]>> {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    .slice(0, 10);
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
    .slice(0, 10);
  const symbolParam = symbols.slice(0, 50).join(",");

  try {
    const url =
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${symbolParam}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      logger.warn(`Finnhub returned ${res.status}`);
      return new Map();
    }
    const data = await res.json() as { earningsCalendar?: FinnhubEarning[] };
    const list = data.earningsCalendar ?? [];
    const bySymbol = new Map<string, FinnhubEarning[]>();
    for (const item of list) {
      if (!item.symbol || !item.date) continue;
      const arr = bySymbol.get(item.symbol) ?? [];
      arr.push(item);
      bySymbol.set(item.symbol, arr);
    }
    return bySymbol;
  } catch (err) {
    logger.warn("Finnhub fetch failed", { err: err as Error });
    return new Map();
  }
}

function syntheticEarningsEvents(symbols: string[]): MarketAdapterEvent[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const events: MarketAdapterEvent[] = [];

  symbols.forEach((symbol, i) => {
    const daysAhead = (i % 85) + 5;
    const daysBehind = 30 + (i % 30);
    const impact = IMPACT_ROTATION[i % IMPACT_ROTATION.length];
    const quarter = ["Q1", "Q2", "Q3", "Q4"][Math.floor(i / 20) % 4];

    events.push({
      id: `earnings-${symbol}-future`,
      type: "earnings",
      ticker: symbol,
      headline: `${symbol} ${quarter} Earnings Release (Simulated)`,
      scheduledAt: now + daysAhead * dayMs,
      impact,
      ts: now,
    });

    events.push({
      id: `earnings-${symbol}-past`,
      type: "earnings",
      ticker: symbol,
      headline: `${symbol} Prior Quarter Earnings (Simulated)`,
      scheduledAt: now - daysBehind * dayMs,
      impact,
      ts: now - daysBehind * dayMs,
    });
  });

  return events;
}

export async function seedEarningsEvents(
  symbols: string[],
): Promise<MarketAdapterEvent[]> {
  const apiKey = Deno.env.get("FINNHUB_KEY");

  if (apiKey) {
    const bySymbol = await fetchFinnhubEarnings(apiKey, symbols);
    if (bySymbol.size > 0) {
      const now = Date.now();
      const events: MarketAdapterEvent[] = [];
      for (const [symbol, earnings] of bySymbol) {
        for (const e of earnings) {
          const scheduledAt = new Date(e.date).getTime();
          const impact = deriveImpact(e.epsActual, e.epsEstimate);
          const quarter = e.quarter != null && e.year != null
            ? `Q${e.quarter} ${e.year}`
            : "";
          const headline = `${symbol}${quarter ? ` ${quarter}` : ""} Earnings`;
          events.push({
            id: `finnhub-earnings-${symbol}-${e.date}`,
            type: "earnings",
            ticker: symbol,
            headline,
            scheduledAt,
            impact,
            ts: now,
          });
        }
      }
      logger.info(`Loaded ${events.length} real earnings events from Finnhub`);
      return events;
    }
  }

  logger.info("Using synthetic earnings events (no FINNHUB_KEY or no data)");
  return syntheticEarningsEvents(symbols);
}

export function seedDividendEvents(symbols: string[]): MarketAdapterEvent[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return symbols
    .filter((_, i) => i % 2 === 0)
    .map((symbol, i) => ({
      id: `dividend-${symbol}`,
      type: "dividend" as const,
      ticker: symbol,
      headline: `${symbol} Ex-Dividend Date (Simulated)`,
      scheduledAt: now + ((i % 45) + 3) * dayMs,
      impact: "low" as const,
      ts: now,
    }));
}
