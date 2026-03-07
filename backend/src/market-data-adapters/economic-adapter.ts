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

export function seedEconomicEvents(): MarketAdapterEvent[] {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  return MACRO_CALENDAR.map((tmpl, i) => ({
    id: `economic-${i}-${tmpl.weekOffset}`,
    type: "economic" as const,
    headline: tmpl.headline,
    scheduledAt: now + tmpl.weekOffset * weekMs,
    impact: tmpl.impact,
    ts: now,
  }));
}
