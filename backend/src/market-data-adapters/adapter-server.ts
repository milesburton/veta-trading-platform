import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createProducer } from "../lib/messaging.ts";
import type { MarketAdapterEvent } from "../types/intelligence.ts";
import { seedEarningsEvents } from "./earnings-adapter.ts";
import { seedEconomicEvents } from "./economic-adapter.ts";

const PORT = Number(Deno.env.get("MARKET_DATA_ADAPTERS_PORT")) || 5_016;
const MARKET_SIM_URL = Deno.env.get("MARKET_SIM_URL") || "http://localhost:5000";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const events: MarketAdapterEvent[] = [];

function storeEvent(ev: MarketAdapterEvent): void {
  events.push(ev);
  if (events.length > 2000) events.splice(0, events.length - 2000);
}

const producer = await createProducer("market-data-adapters").catch((err) => {
  console.warn("[market-data-adapters] Redpanda unavailable:", err.message);
  return null;
});

export async function publishEvent(ev: MarketAdapterEvent): Promise<void> {
  storeEvent(ev);
  if (!producer) return;
  await producer.send("market.external.events", ev).catch(() => {});
}

let knownSymbols: string[] = [];

async function loadSymbols(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_SIM_URL}/assets`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return;
    const assets = await res.json() as { symbol: string }[];
    knownSymbols = assets.map((a) => a.symbol);
    console.log(`[market-data-adapters] Loaded ${knownSymbols.length} symbols`);
  } catch {
    console.warn("[market-data-adapters] Could not load symbols from market-sim, using fallback list");
    knownSymbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK", "JPM", "UNH"];
  }
}

async function seedEvents(): Promise<void> {
  await loadSymbols();
  if (knownSymbols.length === 0) return;

  const earningsEvents = await seedEarningsEvents(knownSymbols);
  const economicEvents = await seedEconomicEvents();

  console.log(`[market-data-adapters] Seeding ${earningsEvents.length} earnings + ${economicEvents.length} economic events`);

  for (const ev of [...earningsEvents, ...economicEvents]) {
    await publishEvent(ev);
  }
}

await seedEvents();
setInterval(async () => {
  await seedEvents();
}, 7 * 24 * 60 * 60 * 1000);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, (req: Request): Response => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === "/health" && req.method === "GET") {
    return json({ service: "market-data-adapters", version: VERSION, status: "ok", eventCount: events.length });
  }

  if (path === "/events" && req.method === "GET") {
    const ticker = url.searchParams.get("ticker");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 500);
    const now = Date.now();
    const fromTs = now - 7 * 24 * 60 * 60 * 1000;
    const toTs = now + 90 * 24 * 60 * 60 * 1000;

    let filtered = events.filter((e) => e.scheduledAt >= fromTs && e.scheduledAt <= toTs);
    if (ticker) filtered = filtered.filter((e) => e.ticker === ticker || !e.ticker);
    filtered.sort((a, b) => a.scheduledAt - b.scheduledAt);
    return json(filtered.slice(0, limit));
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[market-data-adapters] Running on port ${PORT}`);
