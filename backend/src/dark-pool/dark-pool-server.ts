/**
 * Dark Pool ATS (Alternative Trading System)
 *
 * Subscribes to "orders.routed" on the message bus and admits orders with
 * destinationVenue === "DARK1". Runs periodic midpoint matching cycles.
 *
 * On match:
 *   - Publishes "dark.execution"  — paired trade record for audit
 *   - Publishes "orders.filled"   — one per side (buy + sell), mirrors EMS shape
 *   - Publishes "fix.execution"   — one per side, consumed by fix-archive
 *
 * Unmatched orders that exceed ORDER_TIMEOUT_MS are either:
 *   - Re-routed to the lit market (RESIDUAL_ACTION=reroute, default), or
 *   - Expired (RESIDUAL_ACTION=expire)
 *
 * No pre-trade transparency: limit prices, queue depth, and counterparty
 * identity are never exposed externally. The /pool/stats endpoint returns
 * only aggregate quantities, not prices.
 *
 * HTTP surface: GET /health, GET /pool/stats
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "@veta/market-client";
import { createConsumer, createProducer } from "@veta/messaging";
import { settlementDate } from "@veta/settlement";
import { CORS_HEADERS, corsOptions, json } from "@veta/http";

const PORT = Number(Deno.env.get("DARK_POOL_PORT")) || 5_027;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const MATCH_CYCLE_MS = Number(Deno.env.get("MATCH_CYCLE_MS")) || 500;
const EXPIRY_SWEEP_MS = Number(Deno.env.get("EXPIRY_SWEEP_MS")) || 2_000;
const ORDER_TIMEOUT_MS = Number(Deno.env.get("ORDER_TIMEOUT_MS")) || 30_000;
const DARK_POOL_MIN_BLOCK = Number(Deno.env.get("DARK_POOL_MIN_BLOCK")) ||
  10_000;
const RESIDUAL_ACTION = Deno.env.get("RESIDUAL_ACTION") || "reroute";

interface RoutedOrder {
  orderId: string;
  clientOrderId?: string;
  userId?: string;
  userRole?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt?: number;
  strategy: string;
  algoParams?: Record<string, unknown>;
  instrumentType?: string;
  desk?: string;
  marketType?: string;
  destinationVenue?: string;
  ts: number;
}

interface DarkOrder {
  orderId: string;
  clientOrderId?: string;
  userId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  remainingQty: number;
  limitPrice: number;
  admittedAt: number;
  deadlineAt: number;
  strategy: string;
  algoParams?: Record<string, unknown>;
  desk?: string;
}

interface SymbolPool {
  buys: DarkOrder[];
  sells: DarkOrder[];
}

interface DarkFill {
  execId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyClientOrderId?: string;
  sellClientOrderId?: string;
  buyUserId?: string;
  sellUserId?: string;
  asset: string;
  matchedQty: number;
  midPrice: number;
  settlementDate: string;
  ts: number;
}

const orderBook = new Map<string, SymbolPool>();
let darkExecSeq = 1;
let totalMatchedToday = 0;
let totalMatchedAllTime = 0;
let todayDateUtc = new Date().toISOString().slice(0, 10);

function nextExecId(): string {
  return `DX${String(darkExecSeq++).padStart(8, "0")}`;
}

function getOrCreatePool(asset: string): SymbolPool {
  let pool = orderBook.get(asset);
  if (!pool) {
    pool = { buys: [], sells: [] };
    orderBook.set(asset, pool);
  }
  return pool;
}

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("dark-pool").catch((err) => {
  console.warn(
    "[dark-pool] Redpanda unavailable — executions will not be published:",
    err.message,
  );
  return null;
});

const consumer = await createConsumer("dark-pool-routed", ["orders.routed"])
  .catch((err) => {
    console.warn("[dark-pool] Cannot subscribe to orders.routed:", err.message);
    return null;
  });

consumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;

  if (order.destinationVenue !== "DARK1") return; // not for us
  if (order.marketType !== "dark") return;

  if (!order.asset || !order.side || !order.quantity || !order.limitPrice) {
    console.warn(
      `[dark-pool] Rejected malformed order ${order.orderId}: missing required fields`,
    );
    return;
  }

  if (order.quantity < DARK_POOL_MIN_BLOCK) {
    console.warn(
      `[dark-pool] Rejected order ${order.orderId}: qty ${order.quantity} below min block ${DARK_POOL_MIN_BLOCK}`,
    );
    return;
  }

  const now = Date.now();
  const darkOrder: DarkOrder = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    userId: order.userId,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    remainingQty: order.quantity,
    limitPrice: order.limitPrice,
    admittedAt: now,
    deadlineAt: now + ORDER_TIMEOUT_MS,
    strategy: order.strategy,
    algoParams: order.algoParams,
    desk: order.desk ?? "equity",
  };

  const pool = getOrCreatePool(order.asset);
  if (order.side === "BUY") {
    pool.buys.push(darkOrder);
  } else {
    pool.sells.push(darkOrder);
  }

  console.log(
    `[dark-pool] Admitted ${order.side} ${order.quantity} ${order.asset} @ limit=${order.limitPrice} orderId=${order.orderId}`,
  );
});

function matchSymbol(
  pool: SymbolPool,
  asset: string,
  midPrice: number,
): DarkFill[] {
  // FIFO order — price not used for priority (dark pool matching semantics)
  pool.buys.sort((a, b) => a.admittedAt - b.admittedAt);
  pool.sells.sort((a, b) => a.admittedAt - b.admittedAt);

  const fills: DarkFill[] = [];
  const now = Date.now();

  let bi = 0;
  let si = 0;

  while (bi < pool.buys.length && si < pool.sells.length) {
    const buy = pool.buys[bi];
    const sell = pool.sells[si];

    if (now >= buy.deadlineAt) {
      bi++;
      continue;
    }
    if (now >= sell.deadlineAt) {
      si++;
      continue;
    }

    const buyEligible = buy.limitPrice >= midPrice;
    const sellEligible = sell.limitPrice <= midPrice;

    if (!buyEligible) {
      bi++;
      continue;
    }
    if (!sellEligible) {
      si++;
      continue;
    }

    const matchedQty = Math.min(buy.remainingQty, sell.remainingQty);
    if (matchedQty <= 0) {
      if (buy.remainingQty <= 0) bi++;
      if (sell.remainingQty <= 0) si++;
      continue;
    }

    buy.remainingQty -= matchedQty;
    sell.remainingQty -= matchedQty;

    const sd = settlementDate("equity");
    fills.push({
      execId: nextExecId(),
      buyOrderId: buy.orderId,
      sellOrderId: sell.orderId,
      buyClientOrderId: buy.clientOrderId,
      sellClientOrderId: sell.clientOrderId,
      buyUserId: buy.userId,
      sellUserId: sell.userId,
      asset,
      matchedQty,
      midPrice,
      settlementDate: sd,
      ts: now,
    });

    console.log(
      `[dark-pool] Match ${
        fills[fills.length - 1].execId
      }: ${matchedQty} ${asset} @ ${midPrice} ` +
        `buy=${buy.orderId} sell=${sell.orderId}`,
    );

    if (buy.remainingQty <= 0) bi++;
    if (sell.remainingQty <= 0) si++;
  }

  pool.buys = pool.buys.filter((o) => o.remainingQty > 0);
  pool.sells = pool.sells.filter((o) => o.remainingQty > 0);

  return fills;
}

function buildOrdersFilled(
  fill: DarkFill,
  side: "BUY" | "SELL",
  order: DarkOrder,
): Record<string, unknown> {
  const isFullFill = order.remainingQty === 0;
  return {
    execId: `${fill.execId}-${side}`,
    childId: `${order.orderId}-dark-${fill.ts}`,
    parentOrderId: order.orderId,
    clientOrderId: order.clientOrderId,
    userId: order.userId,
    algo: "DARK",
    asset: fill.asset,
    side,
    requestedQty: order.quantity,
    filledQty: fill.matchedQty,
    remainingQty: order.remainingQty,
    avgFillPrice: fill.midPrice,
    midPrice: fill.midPrice,
    marketImpactBps: 0, // dark pool: no market impact by definition
    venue: "DARK1",
    counterparty: "DARK1",
    liquidityFlag: "CROSS",
    commissionUSD: 0,
    secFeeUSD: 0,
    finraTafUSD: 0,
    totalFeeUSD: 0,
    settlementDate: fill.settlementDate,
    desk: order.desk ?? "equity",
    marketType: "dark",
    execType: isFullFill ? "2" : "1", // 2=Fill, 1=PartialFill
    ts: fill.ts,
  };
}

function buildFixExecution(
  fill: DarkFill,
  side: "BUY" | "SELL",
  order: DarkOrder,
): Record<string, unknown> {
  const isFullFill = order.remainingQty === 0;
  return {
    execId: `${fill.execId}-${side}`,
    clOrdId: `${order.orderId}-dark-${fill.ts}`,
    origClOrdId: order.orderId,
    symbol: fill.asset,
    side: side === "BUY" ? "1" : "2",
    ordType: "2", // Limit
    execType: isFullFill ? "2" : "1",
    ordStatus: isFullFill ? "2" : "1",
    leavesQty: order.remainingQty,
    cumQty: order.quantity - order.remainingQty,
    avgPx: fill.midPrice,
    lastQty: fill.matchedQty,
    lastPx: fill.midPrice,
    venue: "DARK1",
    counterparty: "DARK1",
    commission: 0,
    settlDate: fill.settlementDate,
    transactTime: new Date(fill.ts).toISOString(),
    ts: fill.ts,
  };
}

async function runMatchCycle(): Promise<void> {
  const tick = marketClient.getLatest();

  for (const [asset, pool] of orderBook) {
    if (pool.buys.length === 0 || pool.sells.length === 0) continue;

    const midPrice = tick.prices[asset];
    if (!midPrice) {
      console.warn(`[dark-pool] No price for ${asset} — skipping match`);
      continue;
    }

    const buyMap = new Map(pool.buys.map((o) => [o.orderId, o]));
    const sellMap = new Map(pool.sells.map((o) => [o.orderId, o]));

    const fills = matchSymbol(pool, asset, midPrice);

    for (const fill of fills) {
      const buyOrder = buyMap.get(fill.buyOrderId)!;
      const sellOrder = sellMap.get(fill.sellOrderId)!;

      totalMatchedToday++;
      totalMatchedAllTime++;

      await producer?.send("dark.execution", fill).catch(() => {});
      await producer?.send(
        "orders.filled",
        buildOrdersFilled(fill, "BUY", buyOrder),
      ).catch(() => {});
      await producer?.send(
        "orders.filled",
        buildOrdersFilled(fill, "SELL", sellOrder),
      ).catch(() => {});
      await producer?.send(
        "fix.execution",
        buildFixExecution(fill, "BUY", buyOrder),
      ).catch(() => {});
      await producer?.send(
        "fix.execution",
        buildFixExecution(fill, "SELL", sellOrder),
      ).catch(() => {});
    }

    if (pool.buys.length === 0 && pool.sells.length === 0) {
      orderBook.delete(asset);
    }
  }
}

async function sweepExpiredOrders(): Promise<void> {
  const now = Date.now();

  const todayUtc = new Date().toISOString().slice(0, 10);
  if (todayUtc !== todayDateUtc) {
    totalMatchedToday = 0;
    todayDateUtc = todayUtc;
  }

  for (const [asset, pool] of orderBook) {
    const expiredBuys = pool.buys.filter((o) => now >= o.deadlineAt);
    const expiredSells = pool.sells.filter((o) => now >= o.deadlineAt);

    pool.buys = pool.buys.filter((o) => now < o.deadlineAt);
    pool.sells = pool.sells.filter((o) => now < o.deadlineAt);

    for (const order of [...expiredBuys, ...expiredSells]) {
      if (order.remainingQty <= 0) continue; // fully filled — already handled

      console.log(
        `[dark-pool] Order ${order.orderId} (${order.side} ${order.remainingQty} ${asset}) timed out — action=${RESIDUAL_ACTION}`,
      );

      if (RESIDUAL_ACTION === "reroute") {
        const reroutedOrder = {
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          userId: order.userId,
          asset,
          side: order.side,
          quantity: order.remainingQty,
          limitPrice: order.limitPrice,
          strategy: order.strategy,
          algoParams: order.algoParams,
          desk: order.desk,
          marketType: "lit",
          destinationVenue: "XNAS",
          reroutedFromDark: true,
          ts: now,
        };
        await producer?.send("orders.routed", reroutedOrder).catch(() => {});
      } else {
        await producer?.send("orders.expired", {
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          userId: order.userId,
          asset,
          side: order.side,
          remainingQty: order.remainingQty,
          reason: "dark_pool_timeout",
          ts: now,
        }).catch(() => {});
      }
    }

    if (pool.buys.length === 0 && pool.sells.length === 0) {
      orderBook.delete(asset);
    }
  }
}

setInterval(() => {
  runMatchCycle().catch(console.error);
}, MATCH_CYCLE_MS);
setInterval(() => {
  sweepExpiredOrders().catch(console.error);
}, EXPIRY_SWEEP_MS);

console.log(`[dark-pool] Listening for orders.routed (DARK1) on message bus`);
console.log(
  `[dark-pool] Match cycle=${MATCH_CYCLE_MS}ms timeout=${ORDER_TIMEOUT_MS}ms residual=${RESIDUAL_ACTION}`,
);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return corsOptions();

  if (url.pathname === "/health" && req.method === "GET") {
    return json({ service: "dark-pool", version: VERSION, status: "ok" });
  }

  if (url.pathname === "/pool/stats" && req.method === "GET") {
    const depth: Record<
      string,
      { buys: number; sells: number; buyQty: number; sellQty: number }
    > = {};
    for (const [asset, pool] of orderBook) {
      depth[asset] = {
        buys: pool.buys.length,
        sells: pool.sells.length,
        buyQty: pool.buys.reduce((s, o) => s + o.remainingQty, 0),
        sellQty: pool.sells.reduce((s, o) => s + o.remainingQty, 0),
      };
    }
    return json({
      service: "dark-pool",
      version: VERSION,
      matchCycleMs: MATCH_CYCLE_MS,
      orderTimeoutMs: ORDER_TIMEOUT_MS,
      residualAction: RESIDUAL_ACTION,
      totalMatchedToday,
      totalMatchedAllTime,
      currentDepth: depth,
      ts: Date.now(),
    });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
