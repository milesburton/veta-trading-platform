/**
 * LIMIT order algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=LIMIT).
 * Monitors market prices via market-sim WebSocket.
 * When limit price is touched, publishes "orders.child" to the bus.
 * EMS subscribes to "orders.child" and executes the fill.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "@veta/market-client";
import { createConsumer, createProducer } from "@veta/messaging";
import { serveAlgoHealth, subscribeNewsSignals } from "./common-http.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const PORT = Number(Deno.env.get("ALGO_TRADER_PORT")) || 5_003;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("limit-algo").catch((err) => {
  console.warn(
    "[limit-algo] Redpanda unavailable — orders will not be published:",
    err.message,
  );
  return null;
});

interface PendingLimit {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number; // absolute ms timestamp
  remainingQty: number;
  filledQty: number;
  avgFillPrice: number;
}

const pendingOrders: PendingLimit[] = [];

// Subscribe to orders.routed — filter for LIMIT strategy
const consumer = await createConsumer("limit-algo-routed", ["orders.routed"])
  .catch((err) => {
    console.warn(
      "[limit-algo] Cannot subscribe to orders.routed:",
      err.message,
    );
    return null;
  });

consumer?.onMessage((_topic, raw) => {
  const order = raw as PendingLimit & { strategy?: string; expiresAt?: number };
  if ((order.strategy ?? "LIMIT").toUpperCase() !== "LIMIT") return;

  const pending: PendingLimit = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    // expiresAt from OMS is seconds duration; convert to absolute ms
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    remainingQty: order.quantity,
    filledQty: 0,
    avgFillPrice: 0,
  };

  console.log(
    `[limit-algo] Queued ${pending.side} ${pending.quantity} ${pending.asset} @ ${pending.limitPrice} (${pending.orderId})`,
  );
  pendingOrders.push(pending);
});

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (let i = pendingOrders.length - 1; i >= 0; i--) {
    const order = pendingOrders[i];
    const marketPrice = tick.prices[order.asset];
    if (!marketPrice) continue;

    // Expiry
    if (now >= order.expiresAt) {
      await producer?.send("orders.expired", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "LIMIT",
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        filledQty: order.filledQty,
        avgFillPrice: order.avgFillPrice,
        ts: now,
      }).catch(() => {});
      console.log(
        `[limit-algo] Expired ${order.orderId} filled=${order.filledQty}/${order.quantity}`,
      );
      pendingOrders.splice(i, 1);
      continue;
    }

    const triggered =
      (order.side === "BUY" && marketPrice <= order.limitPrice) ||
      (order.side === "SELL" && marketPrice >= order.limitPrice);

    if (triggered && order.remainingQty > 0) {
      const childId = `${order.orderId}-lim-${now}`;
      console.log(
        `[limit-algo] Triggered ${order.orderId}: ${order.side} ${order.remainingQty} ${order.asset} @ mkt ${marketPrice}`,
      );
      await producer?.send("orders.child", {
        childId,
        parentOrderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "LIMIT",
        asset: order.asset,
        side: order.side,
        quantity: order.remainingQty,
        limitPrice: order.limitPrice,
        marketPrice,
        ts: now,
      }).catch(() => {});

      // Mark as fully sent (EMS will fill and publish orders.filled)
      order.remainingQty = 0;
      pendingOrders.splice(i, 1);
    }
  }

  await producer?.send("algo.heartbeat", {
    algo: "LIMIT",
    ts: now,
    pendingOrders: pendingOrders.length,
  }).catch(() => {});
});

setInterval(async () => {
  const now = Date.now();
  for (let i = pendingOrders.length - 1; i >= 0; i--) {
    const order = pendingOrders[i];
    if (now >= order.expiresAt) {
      console.log(
        `[limit-algo] Expiry sweep: ${order.orderId} filled=${order.filledQty}`,
      );
      pendingOrders.splice(i, 1);
      await producer?.send("orders.expired", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "LIMIT",
        filledQty: order.filledQty,
        avgFillPrice: order.avgFillPrice,
        ts: now,
      }).catch(() => {});
    }
  }
}, 5_000);

serveAlgoHealth(PORT, "limit", VERSION, () => pendingOrders.length);

subscribeNewsSignals("limit-algo-news", "limit-algo");
