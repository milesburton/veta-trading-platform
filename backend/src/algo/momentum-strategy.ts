/**
 * MOMENTUM order algorithm
 *
 * Signal-driven EMA crossover strategy. Waits for a favourable price trend
 * before routing child orders, using a fast/slow EMA crossover to identify
 * momentum direction.
 *
 * On each market tick:
 *   - Updates shortEMA and longEMA with the latest price
 *   - Computes signal = (shortEMA - longEMA) / longEMA * 10000  (in bps)
 *   - BUY:  routes a tranche when signal > entryThresholdBps (upward momentum)
 *   - SELL: routes a tranche when signal < -entryThresholdBps (downward momentum)
 *
 * algoParams.entryThresholdBps  (default 10): signal strength to trigger routing
 * algoParams.maxTranches        (default 5):  max number of child orders
 * algoParams.shortEmaPeriod     (default 3):  fast EMA tick period
 * algoParams.longEmaPeriod      (default 8):  slow EMA tick period
 * algoParams.cooldownTicks      (default 3):  ticks to wait after routing
 *
 * Subscribes to: orders.routed, orders.filled
 * Publishes to:  orders.child, orders.expired, algo.heartbeat
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { serveAlgoHealth, startExpirySweep, subscribeNewsSignals } from "./common-http.ts";
import type { RoutedOrder, FillEvent } from "../types/orders.ts";

const PORT = Number(Deno.env.get("MOMENTUM_ALGO_PORT")) || 5_025;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const ALGO = "MOMENTUM" as const;

console.log(`[momentum-algo] Starting on port ${PORT}`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("momentum-algo").catch((err) => {
  console.warn(
    "[momentum-algo] Redpanda unavailable — orders will not be published:",
    err.message,
  );
  return null;
});

function nextEma(price: number, prevEma: number, period: number): number {
  const k = 2 / (period + 1);
  return price * k + prevEma * (1 - k);
}

interface ActiveMomentum {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  expiresAt: number; // absolute ms
  entryPrice: number; // price at order receipt
  entryThresholdBps: number;
  maxTranches: number;
  shortEmaPeriod: number;
  longEmaPeriod: number;
  cooldownTicks: number;
  shortEma: number; // current fast EMA value
  longEma: number; // current slow EMA value
  ticksSeen: number; // total ticks processed for this order
  cooldownRemaining: number; // ticks remaining in cooldown after last route
  tranchesRouted: number;
  trancheSize: number; // shares per tranche (totalQty / maxTranches)
  totalQty: number;
  remainingQty: number;
  filledQty: number;
  costBasis: number;
}

/** Active momentum orders, keyed by orderId. */
const activeOrders = new Map<string, ActiveMomentum>();

const routedConsumer = await createConsumer("momentum-algo-routed", [
  "orders.routed",
]).catch(
  (err) => {
    console.warn(
      "[momentum-algo] Cannot subscribe to orders.routed:",
      err.message,
    );
    return null;
  },
);

routedConsumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== ALGO) return;

  const params = order.algoParams as {
    entryThresholdBps?: number;
    maxTranches?: number;
    shortEmaPeriod?: number;
    longEmaPeriod?: number;
    cooldownTicks?: number;
  } | undefined;
  const entryThresholdBps = Math.max(
    0.1,
    Number(params?.entryThresholdBps ?? 10),
  );
  const maxTranches = Math.max(1, Number(params?.maxTranches ?? 5));
  const shortEmaPeriod = Math.max(
    2,
    Number(params?.shortEmaPeriod ?? 3),
  );
  const longEmaPeriod = Math.max(
    shortEmaPeriod + 1,
    Number(params?.longEmaPeriod ?? 8),
  );
  const cooldownTicks = Math.max(
    1,
    Number(params?.cooldownTicks ?? 3),
  );

  // Capture entry price from market client's last known tick; fall back to limitPrice
  const entryPrice = marketClient.getLatest()?.prices[order.asset] ??
    order.limitPrice;

  // Seed both EMAs with the entry price (warm start — will refine as ticks arrive)
  const mom: ActiveMomentum = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    limitPrice: order.limitPrice,
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    entryPrice,
    entryThresholdBps,
    maxTranches,
    shortEmaPeriod,
    longEmaPeriod,
    cooldownTicks,
    shortEma: entryPrice,
    longEma: entryPrice,
    ticksSeen: 0,
    cooldownRemaining: 0,
    tranchesRouted: 0,
    trancheSize: Math.max(1, Math.ceil(order.quantity / maxTranches)),
    totalQty: order.quantity,
    remainingQty: order.quantity,
    filledQty: 0,
    costBasis: 0,
  };

  activeOrders.set(order.orderId, mom);

  console.log(
    `[momentum-algo] Queued ${order.orderId}: ${order.quantity} ${order.asset} entry=${
      entryPrice.toFixed(4)
    } threshold=${entryThresholdBps}bps maxTranches=${maxTranches}`,
  );

  producer?.send("algo.heartbeat", {
    algo: ALGO,
    orderId: order.orderId,
    event: "start",
    asset: order.asset,
    quantity: order.quantity,
    entryPrice,
    entryThresholdBps,
    maxTranches,
    shortEmaPeriod,
    longEmaPeriod,
    cooldownTicks,
    ts: Date.now(),
  }).catch(() => {});
});

const fillsConsumer = await createConsumer("momentum-algo-fills", [
  "orders.filled",
]).catch(
  (err) => {
    console.warn(
      "[momentum-algo] Cannot subscribe to orders.filled:",
      err.message,
    );
    return null;
  },
);

fillsConsumer?.onMessage((_topic, raw) => {
  const fill = raw as FillEvent;
  if ((fill.algo ?? "").toUpperCase() !== ALGO) return;

  const order = fill.parentOrderId
    ? activeOrders.get(fill.parentOrderId)
    : undefined;
  if (!order) return;

  const qty = fill.filledQty ?? 0;
  const price = fill.avgFillPrice ?? 0;
  order.filledQty += qty;
  order.costBasis += qty * price;
  order.remainingQty = Math.max(0, order.remainingQty - qty);

  console.log(
    `[momentum-algo] Fill ${order.orderId}: +${qty} @ ${
      price.toFixed(2)
    } | remaining=${order.remainingQty}`,
  );

  if (order.remainingQty <= 0) {
    const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
    console.log(
      `[momentum-algo] Complete ${order.orderId}: filled=${order.filledQty} avg=${
        avgFill.toFixed(4)
      }`,
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

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const order of [...activeOrders.values()]) {
    const marketPrice = tick.prices[order.asset];
    if (!marketPrice) continue;

    if (now >= order.expiresAt) {
      const avgFill = order.filledQty > 0
        ? order.costBasis / order.filledQty
        : 0;
      console.log(
        `[momentum-algo] Expired ${order.orderId}: filled=${order.filledQty} avg=${
          avgFill.toFixed(4)
        }`,
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

    order.ticksSeen += 1;
    order.shortEma = nextEma(marketPrice, order.shortEma, order.shortEmaPeriod);
    order.longEma = nextEma(marketPrice, order.longEma, order.longEmaPeriod);

    const signal = ((order.shortEma - order.longEma) / order.longEma) * 10_000;

    if (order.cooldownRemaining > 0) {
      order.cooldownRemaining -= 1;
    }

    const warmedUp = order.ticksSeen >= order.longEmaPeriod;

    const signalFavourable =
      (order.side === "BUY" && signal > order.entryThresholdBps) ||
      (order.side === "SELL" && signal < -order.entryThresholdBps);

    await producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      asset: order.asset,
      event: "signal",
      marketPrice,
      shortEma: order.shortEma.toFixed(4),
      longEma: order.longEma.toFixed(4),
      signalBps: signal.toFixed(2),
      warmedUp,
      signalFavourable,
      cooldownRemaining: order.cooldownRemaining,
      tranchesRouted: order.tranchesRouted,
      remainingQty: order.remainingQty,
      ts: now,
    }).catch(() => {});

    if (
      !warmedUp ||
      !signalFavourable ||
      order.cooldownRemaining > 0 ||
      order.remainingQty <= 0 ||
      order.tranchesRouted >= order.maxTranches
    ) {
      continue;
    }

    const qty = Math.min(order.trancheSize, order.remainingQty);
    if (qty <= 0) continue;

    order.tranchesRouted += 1;
    order.cooldownRemaining = order.cooldownTicks;
    const childId = `${order.orderId}-mom-${Date.now()}`;

    console.log(
      `[momentum-algo] Tranche ${order.tranchesRouted} for ${order.orderId}: ${qty} ${order.asset} @ mkt ${
        marketPrice.toFixed(4)
      } signal=${signal.toFixed(2)}bps`,
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
      entryPrice: order.entryPrice,
      signalBps: signal.toFixed(2),
      trancheIndex: order.tranchesRouted,
      ts: now,
    }).catch(() => {});

    await producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      asset: order.asset,
      event: "route",
      trancheIndex: order.tranchesRouted,
      qty,
      marketPrice,
      signalBps: signal.toFixed(2),
      remainingQty: order.remainingQty,
      filledQty: order.filledQty,
      ts: now,
    }).catch(() => {});
  }
});

startExpirySweep(activeOrders, producer, "MOMENTUM", "momentum-algo");

serveAlgoHealth(PORT, "momentum", VERSION, () => activeOrders.size);

subscribeNewsSignals("momentum-algo-news", "momentum-algo");
