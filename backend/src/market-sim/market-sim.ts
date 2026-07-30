import "@veta/bootstrap";
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";
import type { OrderBookLevel, OrderBookSnapshot } from "@veta/market-client";
import { createProducer } from "@veta/messaging";
import { intradayVolumeFactor } from "@veta/time-scale";
import { BOND_ASSET_MAP, BOND_ASSETS } from "./bondAssets.ts";
import { COMMODITY_ASSET_MAP, COMMODITY_ASSETS } from "./commodityAssets.ts";
import { FX_ASSET_MAP, FX_ASSETS } from "./fxAssets.ts";
import { isUsEquityRegularSession, parseAllowOutOfHours } from "./marketHours.ts";
import {
  advanceRegime,
  generatePrice,
  isResetInProgress,
  marketData,
  openPrices,
  prewarmPricesAsync,
  refreshSectorShocks,
  seedPrice,
  snapshotOpenPrices,
} from "./priceEngine.ts";
import { nextBookRandom, nextRandom } from "./rng.ts";
import { handleSeedRoute } from "./seedRoute.ts";
import { ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";
import {
  buildTickDiff,
  createTickDiffState,
  isEmptyDiff,
  symbolsNeedingFreshBook,
} from "./tickDiff.ts";

const PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${
  Deno.env.get("JOURNAL_PORT") ?? "5009"
}`;
const MARKET_DATA_URL = `http://${
  Deno.env.get("MARKET_DATA_HOST") ?? "localhost"
}:${Deno.env.get("MARKET_DATA_PORT") ?? "5015"}`;

const realPriceCache = new Map<string, number>();
let overriddenSymbols = new Set<string>();

async function refreshOverrides(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_DATA_URL}/overrides`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { overrides: Record<string, string> };
    overriddenSymbols = new Set(Object.keys(data.overrides));
  } catch {
    /* market-data-service unavailable */
  }
}

async function fetchRealPrice(symbol: string): Promise<void> {
  try {
    const res = await fetch(`${MARKET_DATA_URL}/quote/${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { price: number };
    if (data.price > 0) {
      realPriceCache.set(symbol, data.price);
      logger.info(`Seeding ${symbol} with real price: $${data.price.toFixed(4)}`);
    }
  } catch {
    /* keep cached/GBM price */
  }
}

setInterval(() => refreshOverrides().catch(() => {}), 30_000);
setInterval(
  () => {
    for (const sym of overriddenSymbols) {
      fetchRealPrice(sym).catch(() => {});
    }
  },
  5 * 60 * 1_000
);
refreshOverrides().catch(() => {});

let producer: Awaited<ReturnType<typeof createProducer>> | null = null;
createProducer("market-sim")
  .then((p) => {
    producer = p;
  })
  .catch((err) => logger.warn("Redpanda unavailable — market.ticks not published", { err }));

const ALL_ASSETS = [...SP500_ASSETS, ...FX_ASSETS, ...COMMODITY_ASSETS, ...BOND_ASSETS];
const ALL_ASSET_MAP = new Map([
  ...ASSET_MAP,
  ...FX_ASSET_MAP,
  ...COMMODITY_ASSET_MAP,
  ...BOND_ASSET_MAP,
]);

async function seedFromJournal(): Promise<void> {
  const symbols = ALL_ASSETS.map((a) => a.symbol);
  let seeded = 0;
  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(`${JOURNAL_URL}/candles?instrument=${symbol}&interval=1m&limit=1`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return;
        const rows = (await res.json()) as { close: number }[];
        if (rows.length > 0 && rows[rows.length - 1].close > 0) {
          seedPrice(symbol, rows[rows.length - 1].close);
          seeded++;
        }
      } catch {
        /* journal unavailable */
      }
    })
  );
  if (seeded > 0) {
    logger.info(`Seeded ${seeded}/${symbols.length} assets from journal candle history`);
  } else {
    logger.info("Journal unavailable or empty — starting from initialPrice");
  }
}

snapshotOpenPrices();
const PREWARM_TICKS = Number(Deno.env.get("MARKET_SIM_PREWARM_TICKS")) || 28_080;
prewarmPricesAsync(PREWARM_TICKS).then(() => {
  snapshotOpenPrices();
  logger.info(`Price engine pre-warmed — intraday moves seeded`);
  seedFromJournal()
    .then(() => snapshotOpenPrices())
    .catch((err) => logger.error("seedFromJournal failed", { err: err as Error }));
});

let marketMinute = 0;
let tickCount = 0;
const TICKS_PER_MINUTE = 240;
let allowOutOfHours = parseAllowOutOfHours(Deno.env.get("MARKET_SIM_ALLOW_OUT_OF_HOURS"));

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function computeTickVolumes(minute: number): Record<string, number> {
  const factor = intradayVolumeFactor(minute);
  return ALL_ASSETS.reduce<Record<string, number>>((acc, asset) => {
    const basePerMinute = asset.dailyVolume / 390;
    const jitter = 0.7 + nextRandom() * 0.6;
    acc[asset.symbol] = Math.round(basePerMinute * factor * jitter);
    return acc;
  }, {});
}

const SOR_VENUES = [
  { mic: "XNAS", spreadMult: 1.0, depthMult: 1.0 },
  { mic: "ARCX", spreadMult: 1.08, depthMult: 0.85 },
  { mic: "BATS", spreadMult: 0.95, depthMult: 0.9 },
  { mic: "EDGX", spreadMult: 0.98, depthMult: 0.75 },
  { mic: "IEX", spreadMult: 1.02, depthMult: 0.95 },
  { mic: "MEMX", spreadMult: 0.97, depthMult: 0.65 },
  { mic: "XNYS", spreadMult: 1.05, depthMult: 1.2 },
] as const;
type SorVenueMIC = (typeof SOR_VENUES)[number]["mic"];

const LEVELS = 10;

function buildBookForVenue(
  mid: number,
  dailyVol: number,
  dailyVolume: number,
  spreadMult: number,
  depthMult: number,
  now: number
): OrderBookSnapshot {
  const spreadBps = Math.max(3, Math.min(25, dailyVol * 700 * (0.85 + nextBookRandom() * 0.3)));
  const halfSpread = mid * (spreadBps / 10_000) * spreadMult;
  const avgLotSize = Math.max(100, Math.round(dailyVolume / 5_000));
  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  for (let i = 0; i < LEVELS; i++) {
    const priceStep = halfSpread * (1 + i * 0.6);
    const decay = Math.max(0.05, 1 - i * 0.09);
    bids.push({
      price: parseFloat((mid - priceStep).toFixed(4)),
      size: Math.max(100, Math.round(avgLotSize * depthMult * decay * (0.5 + nextBookRandom()))),
    });
    asks.push({
      price: parseFloat((mid + priceStep).toFixed(4)),
      size: Math.max(100, Math.round(avgLotSize * depthMult * decay * (0.5 + nextBookRandom()))),
    });
  }
  return { bids, asks, mid, ts: now };
}

/**
 * Builds order books only for `symbols` rather than every symbol in
 * `prices`. On the recurring tick, tickDiff.ts's symbolsNeedingFreshBook()
 * already knows which symbols moved enough to be worth a fresh book —
 * building the rest anyway (then discarding them when the diff gate drops
 * them) was the dominant per-tick CPU cost at the full instrument universe
 * size. A full snapshot still passes every symbol through `symbols`.
 */
function computeOrderBook(
  prices: Record<string, number>,
  symbols: readonly string[]
): Record<string, OrderBookSnapshot> {
  const book: Record<string, OrderBookSnapshot> = {};
  const now = Date.now();
  for (const symbol of symbols) {
    const mid = prices[symbol];
    if (mid === undefined) continue;
    const asset = ALL_ASSET_MAP.get(symbol);
    book[symbol] = buildBookForVenue(
      mid,
      asset?.volatility ?? 0.02,
      asset?.dailyVolume ?? 1_000_000,
      1.0,
      1.0,
      now
    );
  }
  return book;
}

function computeVenueBooks(
  prices: Record<string, number>,
  symbols: readonly string[]
): Record<SorVenueMIC, Record<string, OrderBookSnapshot>> {
  const result = {} as Record<SorVenueMIC, Record<string, OrderBookSnapshot>>;
  const now = Date.now();
  for (const venue of SOR_VENUES) {
    const book: Record<string, OrderBookSnapshot> = {};
    for (const symbol of symbols) {
      const mid = prices[symbol];
      if (mid === undefined) continue;
      const asset = ALL_ASSET_MAP.get(symbol);
      book[symbol] = buildBookForVenue(
        mid,
        asset?.volatility ?? 0.02,
        asset?.dailyVolume ?? 1_000_000,
        venue.spreadMult,
        venue.depthMult,
        now
      );
    }
    result[venue.mic] = book;
  }
  return result;
}

type SessionPhase =
  | "PRE_OPEN"
  | "OPENING_AUCTION"
  | "CONTINUOUS"
  | "CLOSING_AUCTION"
  | "HALTED"
  | "CLOSED";

function deriveSessionPhase(minute: number): SessionPhase {
  if (minute < 5) return "PRE_OPEN";
  if (minute < 10) return "OPENING_AUCTION";
  if (minute < 380) return "CONTINUOUS";
  if (minute < 385) return "CLOSING_AUCTION";
  return "CLOSED";
}

const clients = new Set<WebSocket>();

let tickDiffState = createTickDiffState();

setInterval(() => {
  if (isResetInProgress()) return;
  if (!allowOutOfHours && !isUsEquityRegularSession()) return;
  tickCount++;
  if (tickCount % TICKS_PER_MINUTE === 0) {
    marketMinute = (marketMinute + 1) % 390;
  }
  advanceRegime();
  refreshSectorShocks();
  for (const sym of overriddenSymbols) {
    const real = realPriceCache.get(sym);
    if (real) seedPrice(sym, real);
  }
  for (const asset of Object.keys(marketData)) {
    generatePrice(asset);
  }

  const volumes = computeTickVolumes(marketMinute);
  const now = Date.now();
  const freshBookSymbols = symbolsNeedingFreshBook(marketData, tickDiffState, now);
  const orderBook = computeOrderBook(marketData, freshBookSymbols);
  const venueBooks = computeVenueBooks(marketData, freshBookSymbols);
  const sessionPhase = deriveSessionPhase(marketMinute);

  const { diff, nextState } = buildTickDiff(
    {
      prices: { ...marketData },
      openPrices: { ...openPrices },
      volumes,
      marketMinute,
      orderBook,
      venueBooks,
      sessionPhase,
    },
    tickDiffState,
    now
  );
  tickDiffState = nextState;

  if (!isEmptyDiff(diff)) {
    const msg = JSON.stringify({ event: "marketUpdate", data: diff });
    for (const socket of clients) {
      try {
        socket.send(msg);
      } catch {
        clients.delete(socket);
      }
    }
    // docs: /platform/market-simulator/
    // #region docs:venuebooks-sniper-only
    const { venueBooks: _venueBooks, ...kafkaDiff } = diff;
    // #endregion docs:venuebooks-sniper-only
    producer?.send("market.ticks", kafkaDiff).catch(() => {});
  }
}, 250);

logger.info(`Market Simulator running on ws://localhost:${PORT}`);

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(JSON.stringify({ service: "market-sim", version: VERSION, status: "ok" }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (url.pathname === "/assets" && req.method === "GET") {
    return new Response(JSON.stringify(ALL_ASSETS), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (url.pathname === "/prices" && req.method === "GET") {
    return new Response(JSON.stringify({ ...marketData }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (url.pathname === "/admin/market-hours" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        allowOutOfHours,
        regularSessionOpen: isUsEquityRegularSession(),
        timeZone: "America/New_York",
        regularSession: "09:30–16:00",
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  if (url.pathname === "/admin/market-hours" && req.method === "PUT") {
    try {
      const body = (await req.json()) as { allowOutOfHours?: unknown };
      if (typeof body.allowOutOfHours !== "boolean") {
        return new Response(JSON.stringify({ error: "allowOutOfHours must be a boolean" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }
      allowOutOfHours = body.allowOutOfHours;
      logger.info(`Out-of-hours market simulation ${allowOutOfHours ? "enabled" : "disabled"}`);
      return new Response(
        JSON.stringify({
          allowOutOfHours,
          regularSessionOpen: isUsEquityRegularSession(),
          timeZone: "America/New_York",
          regularSession: "09:30–16:00",
        }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  if (url.pathname === "/seed") {
    return handleSeedRoute(req, {
      onReset: () => {
        marketMinute = 0;
        tickCount = 0;
        tickDiffState = createTickDiffState();
      },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    logger.info(`New WebSocket connection`);
    clients.add(socket);
    const volumes = computeTickVolumes(marketMinute);
    const allSymbols = Object.keys(marketData);
    const orderBook = computeOrderBook(marketData, allSymbols);
    const venueBooks = computeVenueBooks(marketData, allSymbols);
    const snapshot = {
      full: true as const,
      prices: { ...marketData },
      volumes,
      marketMinute,
      orderBook,
      venueBooks,
    };
    socket.send(JSON.stringify({ event: "marketData", data: snapshot }));
  };

  socket.onmessage = (event) => {
    logger.info(`Message from client: ${event.data}`);
  };

  socket.onclose = () => {
    clients.delete(socket);
    logger.info(`WebSocket connection closed`);
  };

  return response;
});
