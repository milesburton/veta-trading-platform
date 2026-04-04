/**
 * VWAP (Volume-Weighted Average Price) algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=VWAP).
 * On each tick, computes rolling VWAP over VWAP_WINDOW ticks.
 * Only executes when price deviation from VWAP is within tolerance.
 * Publishes "orders.child" to the bus; EMS subscribes and executes.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient, type MarketTick } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { serveAlgoHealth, startExpirySweepIndexed, subscribeNewsSignals } from "./common-http.ts";

const PORT = Number(Deno.env.get("VWAP_ALGO_PORT")) || 5_006;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VWAP_WINDOW = Number(Deno.env.get("VWAP_WINDOW_TICKS")) || 20;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

console.log(`[vwap-algo] Starting, window=${VWAP_WINDOW} ticks`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("vwap-algo").catch((err) => {
  console.warn("[vwap-algo] Redpanda unavailable — orders will not be published:", err.message);
  return null;
});

interface PriceVolPoint { price: number; volume: number; }
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

interface VwapOrder {
  id: number;
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  totalQty: number;
  filledQty: number;
  costBasis: number;
  expiresAt: number; // absolute ms
  maxDeviation: number;
  maxSlice: number;
  limitPrice: number;
}

let nextId = 1;
const activeOrders = new Map<number, VwapOrder>();

async function processTickForOrder(order: VwapOrder, tick: MarketTick): Promise<void> {
  const price = tick.prices[order.asset];
  const volume = tick.volumes[order.asset] ?? 0;
  if (!price) return;

  updateHistory(order.asset, price, volume);

  const vwap = rollingVwap(order.asset);
  const remaining = order.totalQty - order.filledQty;
  if (remaining <= 0 || vwap === 0) return;

  const deviation = Math.abs(price - vwap) / vwap;
  if (deviation > order.maxDeviation) {
    console.log(
      `[vwap-algo] Skip [${order.id}]: dev=${(deviation * 100).toFixed(2)}% > max ${(order.maxDeviation * 100).toFixed(2)}%`,
    );
    return;
  }

  const sliceQty = Math.min(order.maxSlice, remaining);
  const childId = `${order.orderId}-vwap-${Date.now()}`;

  await producer?.send("orders.child", {
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
    algoParams: { maxDeviation: order.maxDeviation, maxSlice: order.maxSlice, windowTicks: VWAP_WINDOW },
    ts: Date.now(),
  }).catch(() => {});
}

const consumer = await createConsumer("vwap-algo-routed", ["orders.routed"]).catch((err) => {
  console.warn("[vwap-algo] Cannot subscribe to orders.routed:", err.message);
  return null;
});

consumer?.onMessage((_topic, raw) => {
  const order = raw as VwapOrder & { strategy?: string; expiresAt?: number; quantity?: number; algoParams?: { maxDeviation?: number; maxSlice?: number } };
  if ((order.strategy ?? "").toUpperCase() !== "VWAP") return;

  const id = nextId++;
  const state: VwapOrder = {
    id,
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    totalQty: order.totalQty ?? order.quantity ?? 0,
    filledQty: 0,
    costBasis: 0,
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    maxDeviation: order.algoParams?.maxDeviation ?? 0.005,
    maxSlice: order.algoParams?.maxSlice ?? 1_000,
    limitPrice: order.limitPrice ?? 0,
  };
  activeOrders.set(id, state);
  console.log(`[vwap-algo] Queued [${id}] ${state.side} ${state.totalQty} ${state.asset} (${state.orderId})`);
});

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const [id, order] of activeOrders) {
    if (now >= order.expiresAt || order.filledQty >= order.totalQty) {
      if (now >= order.expiresAt && order.filledQty < order.totalQty) {
        await producer?.send("orders.expired", {
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          algo: "VWAP",
          asset: order.asset,
          side: order.side,
          quantity: order.totalQty,
          filledQty: order.filledQty,
          avgFillPrice: order.filledQty > 0 ? order.costBasis / order.filledQty : 0,
          ts: now,
        }).catch(() => {});
      }
      activeOrders.delete(id);
      continue;
    }
    await processTickForOrder(order, tick);
  }

  await producer?.send("algo.heartbeat", {
    algo: "VWAP",
    ts: now,
    activeOrders: activeOrders.size,
  }).catch(() => {});
});

startExpirySweepIndexed(activeOrders, producer, "VWAP", "vwap-algo");

serveAlgoHealth(PORT, "vwap", VERSION, () => activeOrders.size);

subscribeNewsSignals("vwap-algo-news", "vwap-algo");
