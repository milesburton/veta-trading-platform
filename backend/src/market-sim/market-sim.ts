import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { advanceRegime, generatePrice, marketData, openPrices, seedPrice, refreshSectorShocks, prewarmPrices, snapshotOpenPrices } from "./priceEngine.ts";
import { ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";
import { FX_ASSETS, FX_ASSET_MAP } from "./fxAssets.ts";
import { COMMODITY_ASSETS, COMMODITY_ASSET_MAP } from "./commodityAssets.ts";
import { intradayVolumeFactor } from "../lib/timeScale.ts";
import { createProducer } from "../lib/messaging.ts";
import type { OrderBookLevel, OrderBookSnapshot } from "../lib/marketSimClient.ts";

const PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${Deno.env.get("JOURNAL_PORT") ?? "5009"}`;
const MARKET_DATA_URL = `http://${Deno.env.get("MARKET_DATA_HOST") ?? "localhost"}:${Deno.env.get("MARKET_DATA_PORT") ?? "5015"}`;

const realPriceCache = new Map<string, number>();
let overriddenSymbols = new Set<string>();

async function refreshOverrides(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_DATA_URL}/overrides`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return;
    const data = await res.json() as { overrides: Record<string, string> };
    overriddenSymbols = new Set(Object.keys(data.overrides));
  } catch { /* market-data-service unavailable */ }
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
  } catch { /* keep cached/GBM price */ }
}

setInterval(() => refreshOverrides().catch(() => {}), 30_000);
setInterval(() => {
  for (const sym of overriddenSymbols) {
    fetchRealPrice(sym).catch(() => {});
  }
}, 5 * 60 * 1_000);
refreshOverrides().catch(() => {});

const producer = await createProducer("market-sim");

const ALL_ASSETS = [...SP500_ASSETS, ...FX_ASSETS, ...COMMODITY_ASSETS];
const ALL_ASSET_MAP = new Map([...ASSET_MAP, ...FX_ASSET_MAP, ...COMMODITY_ASSET_MAP]);

async function seedFromJournal(): Promise<void> {
  const symbols = ALL_ASSETS.map((a) => a.symbol);
  let seeded = 0;
  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 5_000);
        try {
          const res = await fetch(
            `${JOURNAL_URL}/candles?instrument=${symbol}&interval=1m&limit=1`,
            { signal: abort.signal },
          );
          if (!res.ok) return;
          const rows = await res.json() as { close: number }[];
          if (rows.length > 0 && rows[rows.length - 1].close > 0) {
            seedPrice(symbol, rows[rows.length - 1].close);
            seeded++;
          }
        } finally {
          clearTimeout(timer);
        }
      } catch { /* journal unavailable */ }
    }),
  );
  if (seeded > 0) {
    console.log(`[market-sim] Seeded ${seeded}/${symbols.length} assets from journal candle history`);
  } else {
    console.log("[market-sim] Journal unavailable or empty — starting from initialPrice");
  }
}

await seedFromJournal();
prewarmPrices();
snapshotOpenPrices();
console.log("[market-sim] Price engine pre-warmed — intraday moves seeded");

let marketMinute = 0;
let tickCount = 0;
const TICKS_PER_MINUTE = 240;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function computeTickVolumes(minute: number): Record<string, number> {
  const factor = intradayVolumeFactor(minute);
  return ALL_ASSETS.reduce<Record<string, number>>((acc, asset) => {
    const basePerMinute = asset.dailyVolume / 390;
    const jitter = 0.7 + Math.random() * 0.6;
    acc[asset.symbol] = Math.round(basePerMinute * factor * jitter);
    return acc;
  }, {});
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
    const asset = ALL_ASSET_MAP.get(symbol);
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
      const asset = ALL_ASSET_MAP.get(symbol);
      book[symbol] = buildBookForVenue(mid, asset?.volatility ?? 0.02, asset?.dailyVolume ?? 1_000_000, venue.spreadMult, venue.depthMult, now);
    }
    result[venue.mic] = book;
  }
  return result;
}

type SessionPhase = "PRE_OPEN" | "OPENING_AUCTION" | "CONTINUOUS" | "CLOSING_AUCTION" | "HALTED" | "CLOSED";

function deriveSessionPhase(minute: number): SessionPhase {
  if (minute < 5) return "PRE_OPEN";
  if (minute < 10) return "OPENING_AUCTION";
  if (minute < 380) return "CONTINUOUS";
  if (minute < 385) return "CLOSING_AUCTION";
  return "CLOSED";
}

const clients = new Set<WebSocket>();

setInterval(() => {
  tickCount++;
  if (tickCount % TICKS_PER_MINUTE === 0) marketMinute = (marketMinute + 1) % 390;
  advanceRegime();
  refreshSectorShocks();
  for (const sym of overriddenSymbols) {
    const real = realPriceCache.get(sym);
    if (real) seedPrice(sym, real);
  }
  Object.keys(marketData).forEach((asset) => generatePrice(asset));
  const volumes = computeTickVolumes(marketMinute);
  const orderBook = computeOrderBook(marketData, volumes);
  const venueBooks = computeVenueBooks(marketData);
  const sessionPhase = deriveSessionPhase(marketMinute);
  const tick = { prices: { ...marketData }, openPrices: { ...openPrices }, volumes, marketMinute, orderBook, venueBooks, sessionPhase };
  const msg = JSON.stringify({ event: "marketUpdate", data: tick });

  for (const socket of clients) {
    try { socket.send(msg); } catch { clients.delete(socket); }
  }

  // Publish to Redpanda without venueBooks (too large for default message limits;
  // algo services consume venue data via the direct WebSocket connection instead)
  producer?.send("market.ticks", { prices: tick.prices, openPrices: tick.openPrices, volumes: tick.volumes, marketMinute: tick.marketMinute, orderBook: tick.orderBook, sessionPhase: tick.sessionPhase }).catch(() => {});
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
    return new Response(JSON.stringify(ALL_ASSETS), {
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
