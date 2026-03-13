import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { advanceRegime, generatePrice, marketData, seedPrice, refreshSectorShocks } from "./priceEngine.ts";
import { ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";
import { intradayVolumeFactor } from "../lib/timeScale.ts";
import { createProducer } from "../lib/messaging.ts";
import type { OrderBookLevel, OrderBookSnapshot } from "../lib/marketSimClient.ts";

const PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${Deno.env.get("JOURNAL_PORT") ?? "5009"}`;
const MARKET_DATA_URL = `http://${Deno.env.get("MARKET_DATA_HOST") ?? "localhost"}:${Deno.env.get("MARKET_DATA_PORT") ?? "5015"}`;

// ── Real price overlay ─────────────────────────────────────────────────────────
// Asynchronously fetches real prices for overridden symbols from market-data-service.
// Never blocks the tick loop — updates happen in the background.

const realPriceCache = new Map<string, number>(); // symbol → latest real price
let overriddenSymbols = new Set<string>();

async function refreshOverrides(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_DATA_URL}/overrides`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return;
    const data = await res.json() as { overrides: Record<string, string> };
    overriddenSymbols = new Set(Object.keys(data.overrides));
  } catch {
    // market-data-service not yet available — keep current set
  }
}

async function fetchRealPrice(symbol: string): Promise<void> {
  try {
    const res = await fetch(`${MARKET_DATA_URL}/quote/${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return;
    const data = await res.json() as { price: number };
    if (data.price > 0) {
      realPriceCache.set(symbol, data.price);
      console.log(`[market-sim] Seeding ${symbol} with real price: $${data.price.toFixed(4)}`);
    }
  } catch {
    // market-data-service unavailable — keep using cached/GBM price
  }
}

// Refresh overrides every 30s
setInterval(() => refreshOverrides().catch(() => {}), 30_000);
// Refresh real prices for overridden symbols every 5 min
setInterval(() => {
  for (const sym of overriddenSymbols) {
    fetchRealPrice(sym).catch(() => {});
  }
}, 5 * 60 * 1_000);
// Initial load
refreshOverrides().catch(() => {});

const producer = await createProducer("market-sim").catch((err) => {
  console.warn("[market-sim] Redpanda unavailable, ticks will not be published to bus:", err.message);
  return null;
});

// ── Seed prices from candle-store history ──────────────────────────────────────
// Fetch the last known 1m close for each asset so that prices are continuous
// across restarts rather than resetting to hard-coded initialPrice values.
async function seedFromJournal(): Promise<void> {
  const symbols = SP500_ASSETS.map((a) => a.symbol);
  let seeded = 0;
  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(
          `${JOURNAL_URL}/candles?instrument=${symbol}&interval=1m&limit=1`,
        );
        if (!res.ok) return;
        const rows = await res.json() as { close: number }[];
        if (rows.length > 0 && rows[rows.length - 1].close > 0) {
          seedPrice(symbol, rows[rows.length - 1].close);
          seeded++;
        }
      } catch {
        // Journal not available — keep initialPrice
      }
    }),
  );
  if (seeded > 0) {
    console.log(`[market-sim] Seeded ${seeded}/${symbols.length} assets from journal candle history`);
  } else {
    console.log("[market-sim] Journal unavailable or empty — starting from initialPrice");
  }
}

await seedFromJournal();

let marketMinute = 0;
let tickCount = 0;
const TICKS_PER_MINUTE = 240; // 4 ticks/s × 60 s

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function computeTickVolumes(minute: number): Record<string, number> {
  const factor = intradayVolumeFactor(minute);
  const result: Record<string, number> = {};
  for (const asset of SP500_ASSETS) {
    const basePerMinute = asset.dailyVolume / 390;
    const jitter = 0.7 + Math.random() * 0.6;
    result[asset.symbol] = Math.round(basePerMinute * factor * jitter);
  }
  return result;
}

const SOR_VENUES = [
  { mic: "XNAS", spreadMult: 1.00, depthMult: 1.00 },
  { mic: "ARCX", spreadMult: 1.08, depthMult: 0.85 },
  { mic: "BATS", spreadMult: 0.95, depthMult: 0.90 },
  { mic: "EDGX", spreadMult: 0.98, depthMult: 0.75 },
  { mic: "IEX",  spreadMult: 1.02, depthMult: 0.95 },
  { mic: "MEMX", spreadMult: 0.97, depthMult: 0.65 },
  { mic: "XNYS", spreadMult: 1.05, depthMult: 1.20 },
] as const;
type SorVenueMIC = (typeof SOR_VENUES)[number]["mic"];

function buildBookForVenue(
  mid: number,
  dailyVol: number,
  dailyVolume: number,
  spreadMult: number,
  depthMult: number,
  now: number,
): OrderBookSnapshot {
  const spreadBps = Math.max(3, Math.min(25, dailyVol * 700 * (0.85 + Math.random() * 0.3)));
  const halfSpread = mid * (spreadBps / 10_000) * spreadMult;
  const avgLotSize = Math.max(100, Math.round(dailyVolume / 5_000));
  const LEVELS = 10;
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const priceStep = halfSpread * (1 + i * 0.6);
    const decay = Math.max(0.05, 1 - i * 0.09);
    bids.push({
      price: parseFloat((mid - priceStep).toFixed(4)),
      size: Math.max(100, Math.round(avgLotSize * depthMult * decay * (0.5 + Math.random()))),
    });
    asks.push({
      price: parseFloat((mid + priceStep).toFixed(4)),
      size: Math.max(100, Math.round(avgLotSize * depthMult * decay * (0.5 + Math.random()))),
    });
  }
  return { bids, asks, mid, ts: now };
}

function computeOrderBook(
  prices: Record<string, number>,
  _volumes: Record<string, number>,
): Record<string, OrderBookSnapshot> {
  const book: Record<string, OrderBookSnapshot> = {};
  const now = Date.now();
  for (const [symbol, mid] of Object.entries(prices)) {
    const asset = ASSET_MAP.get(symbol);
    book[symbol] = buildBookForVenue(mid, asset?.volatility ?? 0.02, asset?.dailyVolume ?? 1_000_000, 1.0, 1.0, now);
  }
  return book;
}

function computeVenueBooks(prices: Record<string, number>): Record<SorVenueMIC, Record<string, OrderBookSnapshot>> {
  const result = {} as Record<SorVenueMIC, Record<string, OrderBookSnapshot>>;
  const now = Date.now();
  for (const venue of SOR_VENUES) {
    const book: Record<string, OrderBookSnapshot> = {};
    for (const [symbol, mid] of Object.entries(prices)) {
      const asset = ASSET_MAP.get(symbol);
      book[symbol] = buildBookForVenue(mid, asset?.volatility ?? 0.02, asset?.dailyVolume ?? 1_000_000, venue.spreadMult, venue.depthMult, now);
    }
    result[venue.mic] = book;
  }
  return result;
}

// Track active WebSocket clients for broadcast
const clients = new Set<WebSocket>();

// Global tick loop — advances market and broadcasts to all WS clients + Redpanda
setInterval(() => {
  tickCount++;
  if (tickCount % TICKS_PER_MINUTE === 0) marketMinute = (marketMinute + 1) % 390;
  // Advance shared state before generating individual prices
  advanceRegime();
  refreshSectorShocks();
  // Seed real prices for overridden symbols before GBM step
  for (const sym of overriddenSymbols) {
    const real = realPriceCache.get(sym);
    if (real) seedPrice(sym, real);
  }
  Object.keys(marketData).forEach((asset) => generatePrice(asset));
  const volumes = computeTickVolumes(marketMinute);
  const orderBook = computeOrderBook(marketData, volumes);
  const venueBooks = computeVenueBooks(marketData);
  const tick = { prices: { ...marketData }, volumes, marketMinute, orderBook, venueBooks };
  const msg = JSON.stringify({ event: "marketUpdate", data: tick });

  for (const socket of clients) {
    try { socket.send(msg); } catch { clients.delete(socket); }
  }

  // Publish to Redpanda without venueBooks (too large for default message limits;
  // algo services consume venue data via the direct WebSocket connection instead)
  producer?.send("market.ticks", { prices: tick.prices, volumes: tick.volumes, marketMinute: tick.marketMinute, orderBook: tick.orderBook }).catch(() => {});
}, 250);

console.log(`Market Simulator running on ws://localhost:${PORT}`);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "market-sim", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (url.pathname === "/assets" && req.method === "GET") {
    return new Response(JSON.stringify(SP500_ASSETS), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("New WebSocket connection");
    clients.add(socket);
    const volumes = computeTickVolumes(marketMinute);
    const orderBook = computeOrderBook(marketData, volumes);
    const venueBooks = computeVenueBooks(marketData);
    const snapshot = { prices: { ...marketData }, volumes, marketMinute, orderBook, venueBooks };
    socket.send(JSON.stringify({ event: "marketData", data: snapshot }));
  };

  socket.onmessage = (event) => {
    console.log(`Message from client: ${event.data}`);
  };

  socket.onclose = () => {
    clients.delete(socket);
    console.log("WebSocket connection closed");
  };

  return response;
});
