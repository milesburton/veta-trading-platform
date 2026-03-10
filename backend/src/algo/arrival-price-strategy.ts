/**
 * ARRIVAL PRICE (Implementation Shortfall) order algorithm
 *
 * Captures the mid-price at the moment the order arrives (the "arrival price").
 * Executes over the order duration, sending slices on a schedule that is:
 *   - Front-loaded when urgency is high or price is favourable vs arrival
 *   - Paused when adverse drift from the arrival price exceeds maxSlippageBps
 *
 * algoParams.urgency        (1–100, default 50): higher = more aggressive/front-loaded
 * algoParams.maxSlippageBps (default 30):        pause if adverse drift > threshold
 *
 * Subscribes to: orders.routed, orders.filled
 * Publishes to:  orders.child, orders.expired, algo.heartbeat
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("ARRIVAL_PRICE_ALGO_PORT")) || 5_023;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const ALGO = "ARRIVAL_PRICE" as const;

/** Target interval between slices at urgency=50 (one slice every 5s). */
const BASE_SLICE_INTERVAL_SECS = 5;

console.log(`[arrival-price-algo] Starting on port ${PORT}`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("arrival-price-algo").catch((err) => {
  console.warn(
    "[arrival-price-algo] Redpanda unavailable — orders will not be published:",
    err.message,
  );
  return null;
});

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
  algoParams?: { urgency?: number; maxSlippageBps?: number };
}

interface FillEvent {
  childId?: string;
  parentOrderId?: string;
  clientOrderId?: string;
  algo?: string;
  filledQty?: number;
  avgFillPrice?: number;
}

interface ActiveAP {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  expiresAt: number;       // absolute ms
  receivedAt: number;      // ms — when order was queued
  arrivalPrice: number;    // mid-price captured at receipt
  urgency: number;         // 1–100
  maxSlippageBps: number;  // adverse drift threshold
  totalQty: number;
  totalRemaining: number;
  filledQty: number;
  costBasis: number;
  sliceCount: number;
  lastSliceAt: number;     // ms — timestamp of last child order sent
}

/** Active AP orders, keyed by orderId. */
const activeOrders = new Map<string, ActiveAP>();

// ── Consume orders.routed ─────────────────────────────────────────────────────

const routedConsumer = await createConsumer("ap-algo-routed", ["orders.routed"]).catch((err) => {
  console.warn("[arrival-price-algo] Cannot subscribe to orders.routed:", err.message);
  return null;
});

routedConsumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== ALGO) return;

  const urgency = Math.min(100, Math.max(1, Number(order.algoParams?.urgency ?? 50)));
  const maxSlippageBps = Math.max(1, Number(order.algoParams?.maxSlippageBps ?? 30));

  // Capture arrival price from market client's last known tick
  const arrivalPrice = marketClient.getLatest()?.prices[order.asset] ?? order.limitPrice;

  const ap: ActiveAP = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    limitPrice: order.limitPrice,
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    receivedAt: Date.now(),
    arrivalPrice,
    urgency,
    maxSlippageBps,
    totalQty: order.quantity,
    totalRemaining: order.quantity,
    filledQty: 0,
    costBasis: 0,
    sliceCount: 0,
    lastSliceAt: 0,
  };

  activeOrders.set(order.orderId, ap);

  console.log(
    `[arrival-price-algo] Queued ${order.orderId}: ${order.quantity} ${order.asset} arrival=${arrivalPrice.toFixed(4)} urgency=${urgency} maxSlippage=${maxSlippageBps}bps`,
  );

  producer?.send("algo.heartbeat", {
    algo: ALGO,
    orderId: order.orderId,
    event: "start",
    asset: order.asset,
    quantity: order.quantity,
    arrivalPrice,
    urgency,
    maxSlippageBps,
    ts: Date.now(),
  }).catch(() => {});
});

// ── Consume orders.filled ─────────────────────────────────────────────────────

const fillsConsumer = await createConsumer("ap-algo-fills", ["orders.filled"]).catch((err) => {
  console.warn("[arrival-price-algo] Cannot subscribe to orders.filled:", err.message);
  return null;
});

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
    `[arrival-price-algo] Fill ${order.orderId}: +${qty} @ ${price.toFixed(2)} | remaining=${order.totalRemaining}`,
  );

  if (order.totalRemaining <= 0) {
    const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
    const slipBps = ((avgFill - order.arrivalPrice) / order.arrivalPrice) * 10_000;
    console.log(
      `[arrival-price-algo] Complete ${order.orderId}: filled=${order.filledQty} avg=${avgFill.toFixed(4)} slippage=${slipBps.toFixed(1)}bps`,
    );
    activeOrders.delete(order.orderId);
    producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      event: "complete",
      asset: order.asset,
      filled: order.filledQty,
      avgFillPrice: avgFill.toFixed(4),
      arrivalPrice: order.arrivalPrice,
      slippageBps: slipBps.toFixed(1),
      ts: Date.now(),
    }).catch(() => {});
  }
});

// ── Market tick: slice on schedule ────────────────────────────────────────────

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const order of [...activeOrders.values()]) {
    const marketPrice = tick.prices[order.asset];
    if (!marketPrice) continue;

    // Expiry check
    if (now >= order.expiresAt) {
      const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
      console.log(
        `[arrival-price-algo] Expired ${order.orderId}: filled=${order.filledQty} avg=${avgFill.toFixed(4)}`,
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

    const rawDriftBps = ((marketPrice - order.arrivalPrice) / order.arrivalPrice) * 10_000;
    const adverseDriftBps = order.side === "BUY" ? rawDriftBps : -rawDriftBps;

    if (adverseDriftBps > order.maxSlippageBps) {
      await producer?.send("algo.heartbeat", {
        algo: ALGO,
        orderId: order.orderId,
        asset: order.asset,
        event: "paused",
        marketPrice,
        arrivalPrice: order.arrivalPrice,
        adverseDriftBps: adverseDriftBps.toFixed(1),
        totalRemaining: order.totalRemaining,
        ts: now,
      }).catch(() => {});
      continue;
    }

    // Compute dynamic slice interval based on urgency and remaining duration
    const durationMs = order.expiresAt - order.receivedAt;
    const durationSecs = durationMs / 1_000;
    const targetSlices = Math.max(1, Math.ceil(durationSecs / BASE_SLICE_INTERVAL_SECS));
    const urgencyFactor = order.urgency / 50; // urgency=50 → 1×, urgency=100 → 2×, urgency=25 → 0.5×
    let sliceIntervalMs = (durationMs / (urgencyFactor * targetSlices));

    // Price is favourable (adverse drift < 0): accelerate by 20%
    if (adverseDriftBps < 0) {
      sliceIntervalMs *= 0.8;
    }

    if (now - order.lastSliceAt < sliceIntervalMs) continue;

    // Send a slice
    const sliceQty = Math.min(Math.ceil(order.totalQty / targetSlices), order.totalRemaining);
    if (sliceQty <= 0) continue;

    order.sliceCount += 1;
    const childId = `${order.orderId}-ap-${order.sliceCount}`;
    order.lastSliceAt = now;

    console.log(
      `[arrival-price-algo] Slice ${order.sliceCount} for ${order.orderId}: ${sliceQty} ${order.asset} @ mkt ${marketPrice.toFixed(4)} (arrival ${order.arrivalPrice.toFixed(4)}, drift ${adverseDriftBps.toFixed(1)}bps)`,
    );

    await producer?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: ALGO,
      asset: order.asset,
      side: order.side,
      quantity: sliceQty,
      limitPrice: order.limitPrice,
      marketPrice,
      arrivalPrice: order.arrivalPrice,
      driftBps: rawDriftBps.toFixed(1),
      sliceIndex: order.sliceCount,
      ts: now,
    }).catch(() => {});

    await producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      asset: order.asset,
      event: "slice",
      sliceIndex: order.sliceCount,
      sliceQty,
      totalRemaining: order.totalRemaining,
      filledQty: order.filledQty,
      marketPrice,
      arrivalPrice: order.arrivalPrice,
      driftBps: rawDriftBps.toFixed(1),
      ts: now,
    }).catch(() => {});
  }
});

// ── Independent expiry sweep (fires even when market ticks are sparse) ────────

setInterval(async () => {
  const now = Date.now();
  for (const order of [...activeOrders.values()]) {
    if (now >= order.expiresAt) {
      const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
      console.log(`[arrival-price-algo] Expiry sweep: ${order.orderId} filled=${order.filledQty}`);
      activeOrders.delete(order.orderId);
      await producer?.send("orders.expired", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "ARRIVAL_PRICE",
        filledQty: order.filledQty,
        avgFillPrice: order.filledQty > 0 ? avgFill : 0,
        ts: now,
      }).catch(() => {});
    }
  }
}, 5_000);

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
        service: "arrival-price",
        version: VERSION,
        status: "ok",
        activeOrders: activeOrders.size,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

// News signals — log only; future: widen maxSlippageBps on negative sentiment
createConsumer("ap-algo-news", ["news.signal"]).then((consumer) => {
  consumer.onMessage((_topic, raw) => {
    const sig = raw as { symbol: string; sentiment: string; score: number };
    console.log(
      `[arrival-price-algo] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`,
    );
  });
}).catch(() => {}); // non-fatal
