import type { MarketAdapterEvent } from "../types/intelligence.ts";

interface MacroTemplate {
  headline: string;
  impact: "high" | "medium" | "low";
  weekOffset: number;
}

const MACRO_CALENDAR: MacroTemplate[] = [
  { headline: "Federal Reserve FOMC Meeting Minutes", impact: "high", weekOffset: 1 },
  { headline: "US Non-Farm Payrolls Report", impact: "high", weekOffset: 2 },
  { headline: "US Consumer Price Index (CPI)", impact: "high", weekOffset: 3 },
  { headline: "US GDP Advance Estimate", impact: "high", weekOffset: 5 },
  { headline: "Federal Reserve Interest Rate Decision", impact: "high", weekOffset: 6 },
  { headline: "US Producer Price Index (PPI)", impact: "medium", weekOffset: 1 },
  { headline: "US Retail Sales", impact: "medium", weekOffset: 2 },
  { headline: "US Initial Jobless Claims", impact: "medium", weekOffset: 1 },
  { headline: "ISM Manufacturing PMI", impact: "medium", weekOffset: 3 },
  { headline: "ISM Services PMI", impact: "medium", weekOffset: 4 },
  { headline: "US Housing Starts", impact: "low", weekOffset: 2 },
  { headline: "US Consumer Confidence Index", impact: "low", weekOffset: 3 },
  { headline: "US Durable Goods Orders", impact: "low", weekOffset: 4 },
  { headline: "US Trade Balance", impact: "low", weekOffset: 5 },
  { headline: "ECB Monetary Policy Statement", impact: "medium", weekOffset: 3 },
  { headline: "Bank of England Rate Decision", impact: "medium", weekOffset: 4 },
  { headline: "China PMI Manufacturing", impact: "medium", weekOffset: 2 },
  { headline: "US Treasury 10yr Note Auction", impact: "low", weekOffset: 1 },
];

interface FinnhubEconomicEvent {
  event: string;
  time: string; // ISO datetime or date
  country: string;
  impact: string | null; // "1" | "2" | "3" or null
  unit: string | null;
  actual: string | null;
  estimate: string | null;
}

function mapFinnhubImpact(raw: string | null): "high" | "medium" | "low" {
  if (raw === "3") return "high";
  if (raw === "2") return "medium";
  return "low";
}

async function fetchFinnhubEconomic(apiKey: string): Promise<MarketAdapterEvent[]> {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const url =
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[economic-adapter] Finnhub returned ${res.status}`);
      return [];
    }
    const data = await res.json() as { economicCalendar?: FinnhubEconomicEvent[] };
    const list = data.economicCalendar ?? [];
    const ts = Date.now();

    return list
      .filter((item) => item.event && item.time && !isNaN(new Date(item.time).getTime()))
      .map((item) => ({
        id: `finnhub-economic-${item.event.replace(/\s+/g, "-").toLowerCase()}-${item.time}`,
        type: "economic" as const,
        headline: `${item.event}${item.country ? ` (${item.country})` : ""}`,
        scheduledAt: new Date(item.time).getTime(),
        impact: mapFinnhubImpact(item.impact ?? null),
        ts,
      }));
  } catch (err) {
    console.warn("[economic-adapter] Finnhub fetch failed:", (err as Error).message);
    return [];
  }
}

export async function seedEconomicEvents(): Promise<MarketAdapterEvent[]> {
  const apiKey = Deno.env.get("FINNHUB_KEY");

  if (apiKey) {
    const events = await fetchFinnhubEconomic(apiKey);
    if (events.length > 0) {
      console.log(`[economic-adapter] Loaded ${events.length} real economic events from Finnhub`);
      return events;
    }
  }

  console.log("[economic-adapter] Using synthetic economic calendar (no FINNHUB_KEY or no data)");
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  return MACRO_CALENDAR.map((tmpl) => ({
    id: `synthetic-economic-${tmpl.headline.replace(/\s+/g, "-").toLowerCase()}`,
    type: "economic" as const,
    headline: tmpl.headline,
    scheduledAt: now + tmpl.weekOffset * weekMs,
    impact: tmpl.impact,
    ts: now,
  }));
}
