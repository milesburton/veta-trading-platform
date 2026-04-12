/**
 * ICEBERG order algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=ICEBERG).
 * Hides total order size by sending one small "visible" slice at a time.
 * Waits for each child to fill (via orders.filled) before revealing the next.
 *
 * algoParams.visibleQty controls slice size (default: 100 shares).
 *
 * Subscribes to: orders.routed, orders.filled
 * Publishes to:  orders.child, orders.expired, algo.heartbeat
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { serveAlgoHealth, startExpirySweep, subscribeNewsSignals } from "./common-http.ts";
import type { RoutedOrder, FillEvent } from "../types/orders.ts";

const PORT = Number(Deno.env.get("ICEBERG_ALGO_PORT")) || 5_021;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

console.log(`[iceberg-algo] Starting on port ${PORT}`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("iceberg-algo").catch((err) => {
  console.warn(
    "[iceberg-algo] Redpanda unavailable — orders will not be published:",
    err.message,
  );
  return null;
});

interface ActiveIceberg {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  expiresAt: number; // absolute ms
  visibleQty: number; // slice size (shares per reveal)
  totalRemaining: number; // shares still to execute
  currentSliceQty: number; // qty of the next slice to send
  sliceInFlight: boolean; // true while EMS is processing a child
  filledQty: number; // aggregate filled shares
  costBasis: number; // aggregate cost (for avg fill price)
  sliceCount: number; // total slices sent (for unique childId)
}

const activeOrders = new Map<string, ActiveIceberg>();

const routedConsumer = await createConsumer("iceberg-algo-routed", [
  "orders.routed",
]).catch(
  (err) => {
    console.warn(
      "[iceberg-algo] Cannot subscribe to orders.routed:",
      err.message,
    );
    return null;
  },
);

routedConsumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== "ICEBERG") return;

  const visibleQty = Math.max(1, Number((order.algoParams as { visibleQty?: number })?.visibleQty ?? 100));
  const totalQty = order.quantity;

  const iceberg: ActiveIceberg = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    limitPrice: order.limitPrice,
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    visibleQty,
    totalRemaining: totalQty,
    currentSliceQty: Math.min(visibleQty, totalQty),
    sliceInFlight: false,
    filledQty: 0,
    costBasis: 0,
    sliceCount: 0,
  };

  activeOrders.set(order.orderId, iceberg);

  console.log(
    `[iceberg-algo] Queued ${order.orderId}: ${totalQty} ${order.asset} total, ${visibleQty} per slice (${
      Math.ceil(totalQty / visibleQty)
    } slices)`,
  );

  producer?.send("algo.heartbeat", {
    algo: "ICEBERG",
    orderId: order.orderId,
    event: "start",
    asset: order.asset,
    quantity: totalQty,
    visibleQty,
    slicesEstimated: Math.ceil(totalQty / visibleQty),
    ts: Date.now(),
  }).catch(() => {});
});

const fillsConsumer = await createConsumer("iceberg-algo-fills", [
  "orders.filled",
]).catch(
  (err) => {
    console.warn(
      "[iceberg-algo] Cannot subscribe to orders.filled:",
      err.message,
    );
    return null;
  },
);

fillsConsumer?.onMessage((_topic, raw) => {
  const fill = raw as FillEvent;
  if ((fill.algo ?? "").toUpperCase() !== "ICEBERG") return;

  const order = fill.parentOrderId
    ? activeOrders.get(fill.parentOrderId)
    : undefined;
  if (!order) return;

  const qty = fill.filledQty ?? 0;
  const price = fill.avgFillPrice ?? 0;
  order.filledQty += qty;
  order.costBasis += qty * price;
  order.totalRemaining = Math.max(0, order.totalRemaining - qty);
  order.sliceInFlight = false;

  console.log(
    `[iceberg-algo] Fill ${order.orderId}: +${qty} @ ${
      price.toFixed(2)
    } | remaining=${order.totalRemaining}`,
  );

  if (order.totalRemaining <= 0) {
    const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
    console.log(
      `[iceberg-algo] Complete ${order.orderId}: filled=${order.filledQty} avg=${
        avgFill.toFixed(4)
      }`,
    );
    activeOrders.delete(order.orderId);
    producer?.send("algo.heartbeat", {
      algo: "ICEBERG",
      orderId: order.orderId,
      event: "complete",
      asset: order.asset,
      filled: order.filledQty,
      avgFillPrice: avgFill.toFixed(4),
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  order.currentSliceQty = Math.min(order.visibleQty, order.totalRemaining);
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
        `[iceberg-algo] Expired ${order.orderId}: filled=${order.filledQty} avg=${
          avgFill.toFixed(4)
        }`,
      );
      activeOrders.delete(order.orderId);
      await producer?.send("orders.expired", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "ICEBERG",
        filledQty: order.filledQty,
        avgFillPrice: order.filledQty > 0 ? avgFill : 0,
        ts: now,
      }).catch(() => {});
      continue;
    }

    const triggered =
      (order.side === "BUY" && marketPrice <= order.limitPrice) ||
      (order.side === "SELL" && marketPrice >= order.limitPrice);

    if (!triggered || order.sliceInFlight || order.currentSliceQty <= 0) {
      continue;
    }

    order.sliceCount += 1;
    const childId = `${order.orderId}-ice-${order.sliceCount}`;
    order.sliceInFlight = true;

    console.log(
      `[iceberg-algo] Slice ${order.sliceCount} for ${order.orderId}: ${order.currentSliceQty} ${order.asset} @ mkt ${marketPrice}`,
    );

    await producer?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: "ICEBERG",
      asset: order.asset,
      side: order.side,
      quantity: order.currentSliceQty,
      limitPrice: order.limitPrice,
      marketPrice,
      sliceIndex: order.sliceCount,
      visibleQty: order.visibleQty,
      totalRemaining: order.totalRemaining,
      ts: now,
    }).catch(() => {});

    await producer?.send("algo.heartbeat", {
      algo: "ICEBERG",
      orderId: order.orderId,
      asset: order.asset,
      sliceIndex: order.sliceCount,
      sliceQty: order.currentSliceQty,
      totalRemaining: order.totalRemaining,
      filledQty: order.filledQty,
      ts: now,
    }).catch(() => {});
  }
});

startExpirySweep(activeOrders, producer, "ICEBERG", "iceberg-algo");

serveAlgoHealth(PORT, "iceberg", VERSION, () => activeOrders.size);

subscribeNewsSignals("iceberg-algo-news", "iceberg-algo");
