import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { FeatureVector, MarketAdapterEvent, NewsEvent } from "../types/intelligence.ts";
import { createFeatureStore } from "./feature-store.ts";
import {
  computeEventScore,
  computeMomentum,
  computeNewsVelocity,
  computeRealisedVol,
  computeRelativeVolume,
  computeSectorRelativeStrength,
  computeSentimentDelta,
} from "./feature-computers.ts";
import { intelligencePool } from "../lib/db.ts";

const PORT = Number(Deno.env.get("FEATURE_ENGINE_PORT")) || 5_017;
const JOURNAL_URL = Deno.env.get("JOURNAL_URL") || "http://localhost:5009";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const priceHistory = new Map<string, number[]>();
const volumeHistory = new Map<string, number[]>();
const TICK_WINDOW = 100;

const symbolSectors = new Map<string, string>();

const cachedRealisedVol = new Map<string, number>();

const recentNews: NewsEvent[] = [];
const NEWS_WINDOW_MS = 5 * 60 * 1000;

const upcomingEvents: MarketAdapterEvent[] = [];

const latestFeatures = new Map<string, FeatureVector>();

const store = createFeatureStore(intelligencePool);
store.startCleanup();

function pushHistory(map: Map<string, number[]>, symbol: string, value: number, maxLen: number): void {
  const arr = map.get(symbol) ?? [];
  arr.push(value);
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
  map.set(symbol, arr);
}

function trimOldNews(): void {
  const cutoff = Date.now() - NEWS_WINDOW_MS;
  const firstValid = recentNews.findIndex((e) => e.ts >= cutoff);
  if (firstValid > 0) recentNews.splice(0, firstValid);
  else if (firstValid === -1) recentNews.length = 0;
}

function trimOldEvents(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const kept = upcomingEvents.filter((e) => e.scheduledAt >= cutoff);
  upcomingEvents.splice(0, upcomingEvents.length, ...kept);
}

async function refreshRealisedVol(symbol: string): Promise<void> {
  try {
    const url = `${JOURNAL_URL}/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=120`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return;
    const candles = await res.json() as { close: number }[];
    const closes = candles.map((c) => c.close).filter((v) => v > 0);
    const vol = computeRealisedVol(closes);
    if (vol > 0) cachedRealisedVol.set(symbol, vol);
  } catch { /* use last cached value */ }
}

let volRefreshIndex = 0;
const volRefreshSymbols: string[] = [];

setInterval(async () => {
  if (volRefreshSymbols.length === 0) return;
  const symbol = volRefreshSymbols[volRefreshIndex % volRefreshSymbols.length];
  volRefreshIndex++;
  await refreshRealisedVol(symbol);
}, 60_000 / Math.max(1, volRefreshSymbols.length || 80));

function computeFeatureVector(symbol: string): FeatureVector | null {
  const prices = priceHistory.get(symbol);
  const volumes = volumeHistory.get(symbol);
  if (!prices || prices.length < 2) return null;

  const sector = symbolSectors.get(symbol) ?? "Unknown";
  const sectorSymbols = [...symbolSectors.entries()]
    .filter(([s, sec]) => sec === sector && s !== symbol)
    .map(([s]) => s);
  const sectorHistories = sectorSymbols
    .map((s) => priceHistory.get(s) ?? [])
    .filter((h) => h.length >= 2);

  trimOldNews();
  trimOldEvents();

  const fv: FeatureVector = {
    symbol,
    ts: Date.now(),
    momentum: computeMomentum(prices),
    relativeVolume: volumes ? computeRelativeVolume(volumes) : 1,
    realisedVol: cachedRealisedVol.get(symbol) ?? 0,
    sectorRelativeStrength: computeSectorRelativeStrength(prices, sectorHistories),
    eventScore: computeEventScore(symbol, upcomingEvents),
    newsVelocity: computeNewsVelocity(symbol, recentNews),
    sentimentDelta: computeSentimentDelta(symbol, recentNews),
  };

  return fv;
}

const producer = await createProducer("feature-engine").catch((err) => {
  console.warn("[feature-engine] Redpanda unavailable:", err.message);
  return null;
});

const pendingFeatures = new Map<string, FeatureVector>();

async function flushFeatures(): Promise<void> {
  if (pendingFeatures.size === 0) return;
  const batch = [...pendingFeatures.values()];
  pendingFeatures.clear();

  for (const fv of batch) {
    latestFeatures.set(fv.symbol, fv);
    await store.insert(fv).catch((err) => console.warn("[feature-engine] DB insert error:", err.message));
    if (producer) {
      await producer.send("market.features", fv).catch(() => {});
    }
  }
}

setInterval(flushFeatures, 250);

const tickConsumer = await createConsumer("feature-engine-ticks", ["market.ticks"]).catch((err) => {
  console.warn("[feature-engine] Cannot subscribe to market.ticks:", err.message);
  return null;
});

if (tickConsumer) {
  tickConsumer.onMessage((_topic, raw) => {
    const tick = raw as { prices?: Record<string, number>; volumes?: Record<string, number> };
    if (!tick.prices || typeof tick.prices !== "object") return;

    for (const [symbol, price] of Object.entries(tick.prices)) {
      if (!price) continue;
      pushHistory(priceHistory, symbol, price, TICK_WINDOW);
      const vol = tick.volumes?.[symbol];
      if (vol != null) pushHistory(volumeHistory, symbol, vol, TICK_WINDOW);
      if (!symbolSectors.has(symbol)) {
        if (!volRefreshSymbols.includes(symbol)) volRefreshSymbols.push(symbol);
        refreshRealisedVol(symbol).catch(() => {});
      }
      const fv = computeFeatureVector(symbol);
      if (fv) pendingFeatures.set(fv.symbol, fv);
    }
  });
}

const newsConsumer = await createConsumer("feature-engine-news", ["news.events.normalised"]).catch((err) => {
  console.warn("[feature-engine] Cannot subscribe to news.events.normalised:", err.message);
  return null;
});

if (newsConsumer) {
  newsConsumer.onMessage((_topic, raw) => {
    const event = raw as NewsEvent;
    if (!event.ts) return;
    recentNews.push(event);
    for (const ticker of event.tickers) {
      if (priceHistory.has(ticker)) {
        const fv = computeFeatureVector(ticker);
        if (fv) pendingFeatures.set(fv.symbol, fv);
      }
    }
  });
}

const adapterConsumer = await createConsumer("feature-engine-adapters", ["market.external.events"]).catch((err) => {
  console.warn("[feature-engine] Cannot subscribe to market.external.events:", err.message);
  return null;
});

if (adapterConsumer) {
  adapterConsumer.onMessage((_topic, raw) => {
    const event = raw as MarketAdapterEvent;
    if (!event.scheduledAt) return;
    upcomingEvents.push(event);
    if (event.ticker && priceHistory.has(event.ticker)) {
      const fv = computeFeatureVector(event.ticker);
      if (fv) pendingFeatures.set(fv.symbol, fv);
    }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "feature-engine",
      version: VERSION,
      status: "ok",
      trackedSymbols: priceHistory.size,
      cachedVolSymbols: cachedRealisedVol.size,
      recentNewsCount: recentNews.length,
      upcomingEventCount: upcomingEvents.length,
    });
  }

  const histMatch = path.match(/^\/features\/([^/]+)\/history$/);
  if (histMatch && req.method === "GET") {
    const symbol = decodeURIComponent(histMatch[1]);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const history = await store.getHistory(symbol, limit);
    return json(history);
  }

  const fvMatch = path.match(/^\/features\/([^/]+)$/);
  if (fvMatch && req.method === "GET") {
    const symbol = decodeURIComponent(fvMatch[1]);
    const fv = latestFeatures.get(symbol) ?? await store.getLatest(symbol);
    if (!fv) return json({ error: "No feature data for symbol" }, 404);
    return json(fv);
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[feature-engine] Running on port ${PORT}`);
