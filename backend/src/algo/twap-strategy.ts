/**
 * TWAP (Time-Weighted Average Price) algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=TWAP).
 * Divides order into N time slices; on each interval publishes "orders.child"
 * to the bus. EMS subscribes and executes the fill.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "@veta/market-client";
import { createConsumer, createProducer } from "@veta/messaging";
import { serveAlgoHealth, subscribeNewsSignals } from "./common-http.ts";
import type { RoutedOrder } from "@veta/types/orders";

const PORT = Number(Deno.env.get("TWAP_ALGO_PORT")) || 5_004;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const INTERVAL_MS = Number(Deno.env.get("TWAP_INTERVAL_MS")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

console.log(`[twap-algo] Starting, interval=${INTERVAL_MS}ms`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("twap-algo").catch((err) => {
  console.warn(
    "[twap-algo] Redpanda unavailable — orders will not be published:",
    err.message,
  );
  return null;
});

async function executeTWAP(order: RoutedOrder): Promise<void> {
  const durationMs = order.expiresAt * 1_000;
  const numSlices = Math.max(1, Math.round(durationMs / INTERVAL_MS));
  const baseSliceQty = order.quantity / numSlices;

  let filledQty = 0;
  let costBasis = 0;

  console.log(
    `[twap-algo] Started ${order.orderId}: ${order.quantity} ${order.asset} over ${numSlices} slices`,
  );

  await producer?.send("algo.heartbeat", {
    algo: "TWAP",
    orderId: order.orderId,
    event: "start",
    asset: order.asset,
    quantity: order.quantity,
    numSlices,
    ts: Date.now(),
  }).catch(() => {});

  for (let i = 0; i < numSlices && filledQty < order.quantity; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, INTERVAL_MS));

    const remaining = order.quantity - filledQty;
    const sliceQty = Math.min(Math.round(baseSliceQty), remaining);
    if (sliceQty <= 0) break;

    const tick = marketClient.getLatest();
    const marketPrice = tick.prices[order.asset] ?? 0;
    const childId = `${order.orderId}-twap-${i + 1}`;

    await producer?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: "TWAP",
      asset: order.asset,
      side: order.side,
      quantity: sliceQty,
      limitPrice: order.limitPrice,
      marketPrice,
      sliceIndex: i,
      numSlices,
      ts: Date.now(),
    }).catch(() => {});

    filledQty += sliceQty;
    costBasis += sliceQty * marketPrice;

    console.log(
      `[twap-algo] Slice ${
        i + 1
      }/${numSlices}: ${sliceQty} ${order.asset} @ mkt ${marketPrice}`,
    );

    await producer?.send("algo.heartbeat", {
      algo: "TWAP",
      orderId: order.orderId,
      asset: order.asset,
      pendingOrders: numSlices - i - 1,
      ts: Date.now(),
    }).catch(() => {});
  }

  const avgFill = filledQty > 0 ? (costBasis / filledQty).toFixed(4) : "N/A";
  await producer?.send("algo.heartbeat", {
    algo: "TWAP",
    orderId: order.orderId,
    event: "complete",
    asset: order.asset,
    filled: filledQty,
    avgFillPrice: avgFill,
    ts: Date.now(),
  }).catch(() => {});

  console.log(
    `[twap-algo] Complete ${order.orderId}: filled=${filledQty}/${order.quantity} avg=${avgFill}`,
  );
}

const consumer = await createConsumer("twap-algo-routed", ["orders.routed"])
  .catch((err) => {
    console.warn("[twap-algo] Cannot subscribe to orders.routed:", err.message);
    return null;
  });

consumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== "TWAP") return;
  executeTWAP(order); // fire-and-forget; errors are caught internally
});

serveAlgoHealth(PORT, "twap", VERSION, () => 0);

subscribeNewsSignals("twap-algo-news", "twap-algo");
