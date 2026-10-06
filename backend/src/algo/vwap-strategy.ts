import "@veta/bootstrap";
/**
 * VWAP (Volume-Weighted Average Price) algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=VWAP).
 * On each tick, computes rolling VWAP over VWAP_WINDOW ticks.
 * Only executes when price deviation from VWAP is within tolerance.
 * Publishes "orders.child" to the bus; EMS subscribes and executes.
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

const PORT = Number(Deno.env.get("VWAP_ALGO_PORT")) || 5_006;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VWAP_WINDOW = Number(Deno.env.get("VWAP_WINDOW_TICKS")) || 20;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

logger.info(`Starting, window=${VWAP_WINDOW} ticks`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("vwap-algo").catch((err) => {
  logger.warn("Redpanda unavailable — orders will not be published", { err });
  return null;
});

interface PriceVolPoint {
  price: number;
  volume: number;
}
const priceVolHistory = new Map<string, PriceVolPoint[]>();

function updateHistory(asset: string, price: number, volume: number): void {
  const buf = priceVolHistory.get(asset) ?? [];
  buf.push({ price, volume });
  if (buf.length > VWAP_WINDOW) buf.shift();
  priceVolHistory.set(asset, buf);
}

function rollingVwap(asset: string): number {
  const buf = priceVolHistory.get(asset) ?? [];
  const totalVol = buf.reduce((s, p) => s + p.volume, 0);
  if (totalVol === 0) return 0;
  return buf.reduce((s, p) => s + p.price * p.volume, 0) / totalVol;
}

interface VwapOrder extends TrackedOrder {
  readonly id: number;
  readonly maxDeviation: number;
  readonly maxSlice: number;
  readonly limitPrice: number;
  readonly inFlight: InFlightChild | null;
}

let nextId = 1;
const activeOrders = new Map<number, VwapOrder>();
const evaluating = new Set<number>();
const readProgress = createProgressReader(journalBaseUrl());

function setInFlight(id: number, inFlight: InFlightChild | null): void {
  const current = activeOrders.get(id);
  if (current) activeOrders.set(id, { ...current, inFlight });
}

async function processTickForOrder(order: VwapOrder, tick: MarketTick): Promise<void> {
  const price = tick.prices[order.asset];
  const volume = tick.volumes[order.asset] ?? 0;
  if (!price) return;

  updateHistory(order.asset, price, volume);

  const vwap = rollingVwap(order.asset);
  if (vwap === 0) return;

  const deviation = Math.abs(price - vwap) / vwap;
  if (deviation > order.maxDeviation) {
    logger.info(
      `Skip [${order.id}]: dev=${(deviation * 100).toFixed(2)}% > max ${(order.maxDeviation * 100).toFixed(2)}%`
    );
    return;
  }

  const now = Date.now();
  const budget = await readSliceBudget(readProgress, order.orderId, order.quantity, order.inFlight, now);
  if (!budget) return;
  setInFlight(order.id, budget.inFlight);
  if (budget.inFlight || budget.remaining <= 0) return;

  const sliceQty = Math.min(order.maxSlice, budget.remaining);
  const childId = `${order.orderId}-vwap-${now}`;

  await producer
    ?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: "VWAP",
      asset: order.asset,
      side: order.side,
      quantity: sliceQty,
      limitPrice: order.limitPrice,
      marketPrice: price,
      vwap,
      deviation,
      algoParams: {
        maxDeviation: order.maxDeviation,
        maxSlice: order.maxSlice,
        windowTicks: VWAP_WINDOW,
      },
      ts: now,
    })
    .catch(() => {});
  setInFlight(order.id, { childId, quantity: sliceQty, sentAt: now });
}

const IDLE_TIMEOUT_MS = Number(Deno.env.get("VWAP_ALGO_IDLE_TIMEOUT_SECONDS") ?? "300") * 1_000;
const idleExit = armAlgoIdleExit(IDLE_TIMEOUT_MS, () => activeOrders.size === 0, "vwap-algo");

await createTypedConsumer("vwap-algo-routed", [
  {
    topic: "orders.routed",
    schema: RoutedOrderSchema,
    handler: (order: RoutedOrder) => {
      idleExit.touch();
      if ((order.strategy ?? "").toUpperCase() !== "VWAP") return;

      const params = order.algoParams ?? {};
      const id = nextId++;
      const state: VwapOrder = {
        id,
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        expiresAt: Date.now() + Number(order.expiresAt ?? 300) * 1_000,
        maxDeviation: Number(params.maxDeviation ?? 0.005),
        maxSlice: Number(params.maxSlice ?? 1_000),
        limitPrice: order.limitPrice ?? 0,
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

  for (const [id, order] of activeOrders) {
    if (now >= order.expiresAt || evaluating.has(id)) continue;
    evaluating.add(id);
    try {
      await processTickForOrder(order, tick);
    } finally {
      evaluating.delete(id);
    }
  }

  await producer
    ?.send("algo.heartbeat", {
      algo: "VWAP",
      ts: now,
      activeOrders: activeOrders.size,
    })
    .catch(() => {});
});

startJournalProgressSweep(activeOrders, readProgress, producer, "VWAP", "vwap-algo");

serveAlgoHealth(PORT, "vwap", VERSION, () => activeOrders.size);

subscribeNewsSignals("vwap-algo-news", "vwap-algo");
