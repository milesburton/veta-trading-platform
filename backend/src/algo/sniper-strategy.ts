/**
 * SNIPER order algorithm
 *
 * Multi-venue smart routing strategy. Simulates 3 execution venues (XNAS, ARCX, BATS)
 * each with slightly different effective prices. When the price trigger fires, the algo
 * scores venues by best effective price and routes a configurable portion of the remaining
 * quantity across the top venues simultaneously.
 *
 * algoParams.aggressionPct controls what % of remaining qty to route per trigger (default 80).
 * algoParams.maxVenues    controls how many venues to split across (1–3, default 2).
 *
 * A 2-second cooldown between routing events prevents flooding the bus on every tick.
 *
 * Subscribes to: orders.routed, orders.filled
 * Publishes to:  orders.child, orders.expired, algo.heartbeat
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import type { MarketTick } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("SNIPER_ALGO_PORT")) || 5_017;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const ALGO = "SNIPER" as const;
const COOLDOWN_MS = 2_000;
const VENUES = ["XNAS", "ARCX", "BATS", "EDGX", "IEX", "MEMX", "XNYS"] as const;
type SorVenueMIC = (typeof VENUES)[number];

console.log(`[sniper-algo] Starting on port ${PORT}`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("sniper-algo").catch((err) => {
  console.warn("[sniper-algo] Redpanda unavailable — orders will not be published:", err.message);
  return null;
});

// ── Venue price lookup ────────────────────────────────────────────────────────

function bestVenuePrice(
  tick: MarketTick,
  asset: string,
  venue: string,
  side: "BUY" | "SELL",
  fallback: number,
): number {
  const book = tick.venueBooks?.[venue]?.[asset];
  const level = side === "BUY" ? book?.asks[0] : book?.bids[0];
  return level?.price ?? fallback;
}

// ── Order state ───────────────────────────────────────────────────────────────

interface RoutedOrder {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number; // seconds duration from OMS
  strategy?: string;
  algoParams?: { aggressionPct?: number; maxVenues?: number };
}

interface FillEvent {
  childId?: string;
  parentOrderId?: string;
  clientOrderId?: string;
  algo?: string;
  filledQty?: number;
  avgFillPrice?: number;
}

interface ActiveSniper {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  expiresAt: number;      // absolute ms
  aggressionPct: number;  // 1–100: % of remaining qty to route per trigger
  maxVenues: number;      // 1–3: number of venues to split across
  totalQty: number;
  totalRemaining: number;
  filledQty: number;
  costBasis: number;
  sliceCount: number;
  cooldownUntil: number;  // ms — no routing before this timestamp
}

/** Active sniper orders, keyed by orderId. */
const activeOrders = new Map<string, ActiveSniper>();

// ── Consume orders.routed ─────────────────────────────────────────────────────

const routedConsumer = await createConsumer("sniper-algo-routed", ["orders.routed"]).catch(
  (err) => {
    console.warn("[sniper-algo] Cannot subscribe to orders.routed:", err.message);
    return null;
  },
);

routedConsumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== ALGO) return;

  const aggressionPct = Math.min(100, Math.max(1, Number(order.algoParams?.aggressionPct ?? 80)));
  const maxVenues = Math.min(3, Math.max(1, Number(order.algoParams?.maxVenues ?? 2)));

  const sniper: ActiveSniper = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    limitPrice: order.limitPrice,
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    aggressionPct,
    maxVenues,
    totalQty: order.quantity,
    totalRemaining: order.quantity,
    filledQty: 0,
    costBasis: 0,
    sliceCount: 0,
    cooldownUntil: 0,
  };

  activeOrders.set(order.orderId, sniper);

  console.log(
    `[sniper-algo] Queued ${order.orderId}: ${order.quantity} ${order.asset} aggression=${aggressionPct}% maxVenues=${maxVenues}`,
  );

  producer?.send("algo.heartbeat", {
    algo: ALGO,
    orderId: order.orderId,
    event: "start",
    asset: order.asset,
    quantity: order.quantity,
    aggressionPct,
    maxVenues,
    ts: Date.now(),
  }).catch(() => {});
});

// ── Consume orders.filled ─────────────────────────────────────────────────────

const fillsConsumer = await createConsumer("sniper-algo-fills", ["orders.filled"]).catch(
  (err) => {
    console.warn("[sniper-algo] Cannot subscribe to orders.filled:", err.message);
    return null;
  },
);

fillsConsumer?.onMessage((_topic, raw) => {
  const fill = raw as FillEvent;
  if ((fill.algo ?? "").toUpperCase() !== ALGO) return;

  const order = fill.parentOrderId ? activeOrders.get(fill.parentOrderId) : undefined;
  if (!order) return;

  const qty = fill.filledQty ?? 0;
  const price = fill.avgFillPrice ?? 0;
  order.filledQty += qty;
  order.costBasis += qty * price;
  order.totalRemaining = Math.max(0, order.totalRemaining - qty);

  console.log(
    `[sniper-algo] Fill ${order.orderId}: +${qty} @ ${price.toFixed(2)} | remaining=${order.totalRemaining}`,
  );

  if (order.totalRemaining <= 0) {
    const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
    console.log(
      `[sniper-algo] Complete ${order.orderId}: filled=${order.filledQty} avg=${avgFill.toFixed(4)}`,
    );
    activeOrders.delete(order.orderId);
    producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      event: "complete",
      asset: order.asset,
      filled: order.filledQty,
      avgFillPrice: avgFill.toFixed(4),
      ts: Date.now(),
    }).catch(() => {});
  }
});

// ── Market tick: route when triggered ────────────────────────────────────────

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const order of [...activeOrders.values()]) {
    const marketPrice = tick.prices[order.asset];
    if (!marketPrice) continue;

    // Expiry check
    if (now >= order.expiresAt) {
      const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
      console.log(
        `[sniper-algo] Expired ${order.orderId}: filled=${order.filledQty} avg=${avgFill.toFixed(4)}`,
      );
      activeOrders.delete(order.orderId);
      await producer?.send("orders.expired", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: ALGO,
        filledQty: order.filledQty,
        avgFillPrice: order.filledQty > 0 ? avgFill : 0,
        ts: now,
      }).catch(() => {});
      continue;
    }

    // Price trigger
    const triggered =
      (order.side === "BUY" && marketPrice <= order.limitPrice) ||
      (order.side === "SELL" && marketPrice >= order.limitPrice);

    if (!triggered || now < order.cooldownUntil || order.totalRemaining <= 0) continue;

    const scored = VENUES
      .map((v) => ({ venue: v as SorVenueMIC, price: bestVenuePrice(tick, order.asset, v, order.side, marketPrice) }))
      .sort((a, b) => order.side === "BUY" ? a.price - b.price : b.price - a.price);

    const selected = scored.slice(0, order.maxVenues);
    const routeQty = Math.max(1, Math.round(order.totalRemaining * order.aggressionPct / 100));

    let dispatched = 0;
    for (const { venue, price: effectivePrice } of selected) {
      const book = tick.venueBooks?.[venue]?.[order.asset];
      const l1Size = (order.side === "BUY" ? book?.asks[0]?.size : book?.bids[0]?.size) ?? Infinity;
      const qty = Math.min(
        Math.max(1, Math.floor(routeQty / selected.length)),
        Math.floor(l1Size * 0.5),
        order.totalRemaining - dispatched,
      );
      if (qty <= 0) break;

      order.sliceCount += 1;
      const childId = `${order.orderId}-snp-${order.sliceCount}`;

      console.log(
        `[sniper-algo] Route ${order.sliceCount} for ${order.orderId}: ${qty} ${order.asset} → ${venue} @ ${effectivePrice.toFixed(4)}`,
      );

      await producer?.send("orders.child", {
        childId,
        parentOrderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: ALGO,
        asset: order.asset,
        side: order.side,
        quantity: qty,
        limitPrice: order.limitPrice,
        marketPrice,
        venue,
        effectivePrice,
        sliceIndex: order.sliceCount,
        ts: now,
      }).catch(() => {});

      dispatched += qty;
    }

    order.cooldownUntil = now + COOLDOWN_MS;

    await producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      asset: order.asset,
      event: "route",
      venuesUsed: selected.map((v) => v.venue),
      routed: dispatched,
      totalRemaining: order.totalRemaining,
      filledQty: order.filledQty,
      ts: now,
    }).catch(() => {});
  }
});

// ── Health endpoint ───────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve({ port: PORT }, (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const url = new URL(req.url);
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        service: "sniper",
        version: VERSION,
        status: "ok",
        activeOrders: activeOrders.size,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

// News signals — log only
createConsumer("sniper-algo-news", ["news.signal"]).then((consumer) => {
  consumer.onMessage((_topic, raw) => {
    const sig = raw as { symbol: string; sentiment: string; score: number };
    console.log(
      `[sniper-algo] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`,
    );
  });
}).catch(() => {}); // non-fatal
