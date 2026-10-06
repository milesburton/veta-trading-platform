import "@veta/bootstrap";
/**
 * LIMIT order algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=LIMIT).
 * Monitors market prices via market-sim WebSocket.
 * When limit price is touched, publishes "orders.child" to the bus.
 * EMS subscribes to "orders.child" and executes the fill.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";
import { createMarketSimClient } from "@veta/market-client";
import { createProducer, createTypedConsumer } from "@veta/messaging";
import type { RoutedOrder } from "@veta/schemas/orders";
import { RoutedOrderSchema } from "@veta/schemas/orders";
import {
  armAlgoIdleExit,
  serveAlgoHealth,
  startJournalProgressSweep,
  subscribeNewsSignals,
} from "./common-http.ts";
import {
  createProgressReader,
  type InFlightChild,
  journalBaseUrl,
  readSliceBudget,
  type TrackedOrder,
} from "./fill-progress.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const PORT = Number(Deno.env.get("ALGO_TRADER_PORT")) || 5_003;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("limit-algo").catch((err) => {
  logger.warn("Redpanda unavailable — orders will not be published", { err });
  return null;
});

interface PendingLimit extends TrackedOrder {
  readonly limitPrice: number;
  readonly inFlight: InFlightChild | null;
}

const pendingOrders = new Map<string, PendingLimit>();
const evaluating = new Set<string>();
const readProgress = createProgressReader(journalBaseUrl());

function setInFlight(orderId: string, inFlight: InFlightChild | null): void {
  const current = pendingOrders.get(orderId);
  if (current) pendingOrders.set(orderId, { ...current, inFlight });
}

function isTriggered(order: PendingLimit, marketPrice: number): boolean {
  return order.side === "BUY" ? marketPrice <= order.limitPrice : marketPrice >= order.limitPrice;
}

const IDLE_TIMEOUT_MS = Number(Deno.env.get("LIMIT_ALGO_IDLE_TIMEOUT_SECONDS") ?? "300") * 1_000;
const idleExit = armAlgoIdleExit(IDLE_TIMEOUT_MS, () => pendingOrders.size === 0, "limit-algo");

await createTypedConsumer("limit-algo-routed", [
  {
    topic: "orders.routed",
    schema: RoutedOrderSchema,
    handler: (order: RoutedOrder) => {
      idleExit.touch();
      if ((order.strategy ?? "LIMIT").toUpperCase() !== "LIMIT") return;
      if (order.limitPrice === undefined) {
        logger.warn(`LIMIT order ${order.orderId} missing limitPrice`);
        return;
      }
      const pending: PendingLimit = {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        limitPrice: order.limitPrice,
        expiresAt: Date.now() + Number(order.expiresAt ?? 300) * 1_000,
        inFlight: null,
      };
      logger.info(
        `Queued ${pending.side} ${pending.quantity} ${pending.asset} @ ${pending.limitPrice} (${pending.orderId})`
      );
      pendingOrders.set(pending.orderId, pending);
    },
  },
]).catch((err) => {
  logger.warn("Cannot subscribe to orders.routed", { err });
  return null;
});

async function sendTriggeredChild(order: PendingLimit, marketPrice: number): Promise<void> {
  const now = Date.now();
  const budget = await readSliceBudget(readProgress, order.orderId, order.quantity, order.inFlight, now);
  if (!budget) return;
  setInFlight(order.orderId, budget.inFlight);
  if (budget.inFlight || budget.remaining <= 0) return;

  const childId = `${order.orderId}-lim-${now}`;
  logger.info(
    `Triggered ${order.orderId}: ${order.side} ${budget.remaining} ${order.asset} @ mkt ${marketPrice}`
  );

  await producer
    ?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: "LIMIT",
      asset: order.asset,
      side: order.side,
      quantity: budget.remaining,
      limitPrice: order.limitPrice,
      marketPrice,
      ts: now,
    })
    .catch(() => {});
  setInFlight(order.orderId, { childId, quantity: budget.remaining, sentAt: now });
}

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const order of [...pendingOrders.values()]) {
    const marketPrice = tick.prices[order.asset];
    if (!marketPrice || now >= order.expiresAt || evaluating.has(order.orderId)) continue;
    if (!isTriggered(order, marketPrice)) continue;
    evaluating.add(order.orderId);
    try {
      await sendTriggeredChild(order, marketPrice);
    } finally {
      evaluating.delete(order.orderId);
    }
  }

  await producer
    ?.send("algo.heartbeat", {
      algo: "LIMIT",
      ts: now,
      pendingOrders: pendingOrders.size,
    })
    .catch(() => {});
});

startJournalProgressSweep(pendingOrders, readProgress, producer, "LIMIT", "limit-algo");

serveAlgoHealth(PORT, "limit", VERSION, () => pendingOrders.size);

subscribeNewsSignals("limit-algo-news", "limit-algo");
