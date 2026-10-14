import "@veta/bootstrap";
/**
 * POV (Percent of Volume) algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=POV).
 * On each market tick, sizes a child slice as POV_RATE × tick volume,
 * then publishes "orders.child" to the bus. EMS executes.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { logger } from "@veta/logger";
import { createMarketSimClient, type MarketTick } from "@veta/market-client";
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

const PORT = Number(Deno.env.get("POV_ALGO_PORT")) || 5005;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const POV_RATE = Number(Deno.env.get("POV_PERCENTAGE")) / 100 || 0.1;
const MIN_SLICE = Number(Deno.env.get("POV_MIN_SLICE")) || 10;
const MAX_SLICE = Number(Deno.env.get("POV_MAX_SLICE")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

logger.info(`Starting, rate=${(POV_RATE * 100).toFixed(0)}%`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("pov-algo").catch((err) => {
  logger.warn("Redpanda unavailable — orders will not be published", { err });
  return null;
});

interface PovOrder extends TrackedOrder {
  readonly id: number;
  readonly limitPrice?: number;
  readonly inFlight: InFlightChild | null;
}

let nextId = 1;
const activeOrders = new Map<number, PovOrder>();
const evaluating = new Set<number>();
const readProgress = createProgressReader(journalBaseUrl());

function setInFlight(id: number, inFlight: InFlightChild | null): void {
  const current = activeOrders.get(id);
  if (current) activeOrders.set(id, { ...current, inFlight });
}

function povSliceQty(tickVolume: number, remaining: number): number {
  const target = Math.max(MIN_SLICE, Math.min(MAX_SLICE, Math.round(tickVolume * POV_RATE)));
  return Math.min(remaining, target);
}

async function processTickForOrder(state: PovOrder, tick: MarketTick): Promise<void> {
  const tickVolume = tick.volumes[state.asset] ?? 0;
  if (tickVolume === 0) return;

  const now = Date.now();
  const budget = await readSliceBudget(readProgress, state.orderId, state.quantity, state.inFlight, now);
  if (!budget) return;
  setInFlight(state.id, budget.inFlight);
  if (budget.inFlight || budget.remaining <= 0) return;

  const sliceQty = povSliceQty(tickVolume, budget.remaining);
  const childId = `${state.orderId}-pov-${now}`;

  await producer
    ?.send("orders.child", {
      childId,
      parentOrderId: state.orderId,
      clientOrderId: state.clientOrderId,
      algo: "POV",
      asset: state.asset,
      side: state.side,
      quantity: sliceQty,
      limitPrice: state.limitPrice,
      marketPrice: tick.prices[state.asset] ?? 0,
      tickVolume,
      algoParams: { povRate: POV_RATE, minSlice: MIN_SLICE, maxSlice: MAX_SLICE },
      ts: now,
    })
    .catch(() => {});
  setInFlight(state.id, { childId, quantity: sliceQty, sentAt: now });
}

const IDLE_TIMEOUT_MS = Number(Deno.env.get("POV_ALGO_IDLE_TIMEOUT_SECONDS") ?? "300") * 1_000;
const idleExit = armAlgoIdleExit(IDLE_TIMEOUT_MS, () => activeOrders.size === 0, "pov-algo");

await createTypedConsumer("pov-algo-routed", [
  {
    topic: "orders.routed",
    schema: RoutedOrderSchema,
    handler: (order: RoutedOrder) => {
      idleExit.touch();
      if ((order.strategy ?? "").toUpperCase() !== "POV") return;

      const id = nextId++;
      const state: PovOrder = {
        id,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        limitPrice: order.limitPrice,
        expiresAt: Date.now() + Number(order.expiresAt ?? 300) * 1_000,
        inFlight: null,
      };
      activeOrders.set(id, state);
      logger.info(
        `Queued [${id}] ${state.side} ${state.quantity} ${state.asset} (${state.orderId})`
      );
    },
  },
]).catch((err) => {
  logger.warn("Cannot subscribe to orders.routed", { err });
  return null;
});

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const [id, state] of activeOrders) {
    if (now >= state.expiresAt || evaluating.has(id)) continue;
    evaluating.add(id);
    try {
      await processTickForOrder(state, tick);
    } finally {
      evaluating.delete(id);
    }
  }

  await producer
    ?.send("algo.heartbeat", {
      algo: "POV",
      ts: now,
      activeOrders: activeOrders.size,
    })
    .catch(() => {});
});

startJournalProgressSweep(activeOrders, readProgress, producer, "POV", "pov-algo");

serveAlgoHealth(PORT, "pov", VERSION, () => activeOrders.size);

subscribeNewsSignals("pov-algo-news", "pov-algo");
