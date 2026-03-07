import type { MarketAdapterEvent } from "../types/intelligence.ts";

const IMPACT_ROTATION: Array<"high" | "medium" | "low"> = ["high", "medium", "medium", "low"];

export function seedEarningsEvents(symbols: string[]): MarketAdapterEvent[] {
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
