/**
 * IMPLEMENTATION SHORTFALL (IS) order algorithm
 *
 * Minimises total execution cost vs the arrival (decision) price by
 * balancing market impact against timing risk.
 *
 * Slice sizes are front-loaded using a geometric decay schedule:
 *   sliceQty[i] = totalQty * urgency * (1 - urgency)^i  (normalised to sum to totalQty)
 *
 * The algo pauses when adverse drift from the arrival price exceeds
 * maxSlippageBps, and resumes when price reverts within tolerance.
 *
 * algoParams.urgency        (0.0–1.0, default 0.5): higher = more front-loaded / aggressive
 * algoParams.maxSlippageBps (default 50):           pause when adverse drift > threshold
 * algoParams.minSlices      (default 3):            minimum number of slices
 * algoParams.maxSlices      (default 10):           maximum number of slices
 *
 * Subscribes to: orders.routed, orders.filled
 * Publishes to:  orders.child, orders.expired, algo.heartbeat
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "@veta/market-client";
import { createConsumer, createProducer } from "@veta/messaging";
import { serveAlgoHealth, startExpirySweep, subscribeNewsSignals } from "./common-http.ts";
import type { RoutedOrder, FillEvent } from "@veta/types/orders";

const PORT = Number(Deno.env.get("IS_ALGO_PORT")) || 5_026;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const ALGO = "IS" as const;

console.log(`[is-algo] Starting on port ${PORT}`);

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("is-algo").catch((err) => {
  console.warn(
    "[is-algo] Redpanda unavailable — orders will not be published:",
    err.message,
  );
  return null;
});

/**
 * Pre-computed geometric slice schedule for an IS order.
 * sliceQtys[i] is the target quantity for the i-th slice (1-indexed, 0th unused).
 */
interface ActiveIS {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  expiresAt: number; // absolute ms
  receivedAt: number; // ms — when order was queued
  arrivalPrice: number; // mid-price captured at receipt
  urgency: number; // 0.0–1.0
  maxSlippageBps: number; // adverse drift threshold in bps
  totalQty: number;
  totalRemaining: number;
  filledQty: number;
  costBasis: number;
  sliceCount: number; // number of child orders already sent
  lastSliceAt: number; // ms — timestamp of last child order sent
  sliceQtys: number[]; // pre-computed geometric schedule (1-indexed)
  numSlices: number; // total slices in schedule
  sliceIntervalMs: number; // target interval between slices (uniform spacing)
  paused: boolean; // true when adverse drift > maxSlippageBps
}

/** Active IS orders, keyed by orderId. */
const activeOrders = new Map<string, ActiveIS>();

/**
 * Build a front-loaded slice schedule using geometric decay.
 *
 * For urgency u in (0, 1):
 *   raw[i] = u * (1 - u)^i   for i = 0 … n-1
 * Normalise so that sum(raw) = 1, then multiply by totalQty.
 *
 * Edge cases:
 *   urgency = 0  → uniform schedule (u clamped away from 0)
 *   urgency = 1  → first slice takes everything (u clamped away from 1)
 */
function buildSliceSchedule(
  totalQty: number,
  urgency: number,
  minSlices: number,
  maxSlices: number,
  durationMs: number,
): { sliceQtys: number[]; numSlices: number; sliceIntervalMs: number } {
  // Clamp urgency away from degenerate extremes
  const u = Math.max(0.01, Math.min(0.99, urgency));

  // Number of slices: urgency drives how many geometric terms matter before the
  // tail becomes negligible. We scale from minSlices (low urgency) to maxSlices
  // (high urgency) — counter-intuitively, higher urgency concentrates weight in
  // fewer early slices but we still use maxSlices so the schedule has enough
  // resolution. The slice *quantities* do the front-loading work.
  const numSlices = Math.round(
    minSlices + (1 - u) * (maxSlices - minSlices),
  );

  // Raw geometric weights
  const rawWeights: number[] = [];
  for (let i = 0; i < numSlices; i++) {
    rawWeights.push(u * Math.pow(1 - u, i));
  }

  const weightSum = rawWeights.reduce((a, b) => a + b, 0);

  // Convert to quantities (integer, rounding residual to first slice)
  const sliceQtys: number[] = new Array(numSlices + 1).fill(0); // 1-indexed
  let allocated = 0;
  for (let i = 0; i < numSlices; i++) {
    const qty = Math.round((rawWeights[i] / weightSum) * totalQty);
    sliceQtys[i + 1] = qty;
    allocated += qty;
  }
  // Correct any rounding residual in the first slice
  sliceQtys[1] += totalQty - allocated;

  const sliceIntervalMs = durationMs / numSlices;

  return { sliceQtys, numSlices, sliceIntervalMs };
}

const routedConsumer = await createConsumer("is-algo-routed", ["orders.routed"])
  .catch((err) => {
    console.warn("[is-algo] Cannot subscribe to orders.routed:", err.message);
    return null;
  });

routedConsumer?.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== ALGO) return;

  const params = order.algoParams as {
    urgency?: number;
    maxSlippageBps?: number;
    minSlices?: number;
    maxSlices?: number;
  } | undefined;
  const urgency = Math.max(
    0.0,
    Math.min(1.0, Number(params?.urgency ?? 0.5)),
  );
  const maxSlippageBps = Math.max(
    1,
    Number(params?.maxSlippageBps ?? 50),
  );
  const minSlices = Math.max(1, Number(params?.minSlices ?? 3));
  const maxSlices = Math.max(
    minSlices,
    Number(params?.maxSlices ?? 10),
  );

  // Capture arrival price from market client's last known tick
  const arrivalPrice = marketClient.getLatest()?.prices[order.asset] ??
    order.limitPrice;

  const expiresAt = Date.now() + (Number(order.expiresAt ?? 300)) * 1_000;
  const receivedAt = Date.now();
  const durationMs = expiresAt - receivedAt;

  const { sliceQtys, numSlices, sliceIntervalMs } = buildSliceSchedule(
    order.quantity,
    urgency,
    minSlices,
    maxSlices,
    durationMs,
  );

  const is: ActiveIS = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    limitPrice: order.limitPrice,
    expiresAt,
    receivedAt,
    arrivalPrice,
    urgency,
    maxSlippageBps,
    totalQty: order.quantity,
    totalRemaining: order.quantity,
    filledQty: 0,
    costBasis: 0,
    sliceCount: 0,
    lastSliceAt: 0,
    sliceQtys,
    numSlices,
    sliceIntervalMs,
    paused: false,
  };

  activeOrders.set(order.orderId, is);

  console.log(
    `[is-algo] Queued ${order.orderId}: ${order.quantity} ${order.asset} arrival=${
      arrivalPrice.toFixed(4)
    } urgency=${urgency} maxSlippage=${maxSlippageBps}bps slices=${numSlices} interval=${
      (sliceIntervalMs / 1000).toFixed(1)
    }s`,
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
    numSlices,
    sliceIntervalMs,
    ts: Date.now(),
  }).catch(() => {});
});

const fillsConsumer = await createConsumer("is-algo-fills", ["orders.filled"])
  .catch((err) => {
    console.warn("[is-algo] Cannot subscribe to orders.filled:", err.message);
    return null;
  });

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
  order.totalRemaining = Math.max(0, order.totalRemaining - qty);

  console.log(
    `[is-algo] Fill ${order.orderId}: +${qty} @ ${
      price.toFixed(2)
    } | remaining=${order.totalRemaining}`,
  );

  if (order.totalRemaining <= 0) {
    const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
    const slipBps = ((avgFill - order.arrivalPrice) / order.arrivalPrice) *
      10_000;
    const side = order.side;
    const isAdverse = side === "BUY" ? slipBps > 0 : slipBps < 0;

    console.log(
      `[is-algo] Complete ${order.orderId}: filled=${order.filledQty} avg=${
        avgFill.toFixed(4)
      } slippage=${slipBps.toFixed(1)}bps (${
        isAdverse ? "adverse" : "favourable"
      })`,
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
      implementationShortfallBps: slipBps.toFixed(1),
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
        `[is-algo] Expired ${order.orderId}: filled=${order.filledQty} avg=${
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

    // Raw drift: positive = price rose since arrival
    const rawDriftBps =
      ((marketPrice - order.arrivalPrice) / order.arrivalPrice) * 10_000;
    // Adverse drift: positive = market moved against us
    //   BUY  → price rising is adverse (we pay more than arrival)
    //   SELL → price falling is adverse (we receive less than arrival)
    const adverseDriftBps = order.side === "BUY" ? rawDriftBps : -rawDriftBps;

    if (adverseDriftBps > order.maxSlippageBps) {
      if (!order.paused) {
        order.paused = true;
        console.log(
          `[is-algo] Paused ${order.orderId}: drift=${
            adverseDriftBps.toFixed(1)
          }bps > ${order.maxSlippageBps}bps`,
        );
        await producer?.send("algo.heartbeat", {
          algo: ALGO,
          orderId: order.orderId,
          asset: order.asset,
          event: "paused",
          marketPrice,
          arrivalPrice: order.arrivalPrice,
          adverseDriftBps: adverseDriftBps.toFixed(1),
          maxSlippageBps: order.maxSlippageBps,
          totalRemaining: order.totalRemaining,
          ts: now,
        }).catch(() => {});
      }
      continue;
    }

    if (order.paused) {
      order.paused = false;
      console.log(
        `[is-algo] Resumed ${order.orderId}: drift=${
          adverseDriftBps.toFixed(1)
        }bps now within threshold`,
      );
      await producer?.send("algo.heartbeat", {
        algo: ALGO,
        orderId: order.orderId,
        asset: order.asset,
        event: "resumed",
        marketPrice,
        arrivalPrice: order.arrivalPrice,
        adverseDriftBps: adverseDriftBps.toFixed(1),
        totalRemaining: order.totalRemaining,
        ts: now,
      }).catch(() => {});
    }

    if (order.sliceCount >= order.numSlices) continue;

    // When the market is moving in our favour (adverse drift negative), accelerate
    // by 20% to capture the opportunity before it reverses.
    let effectiveIntervalMs = order.sliceIntervalMs;
    if (adverseDriftBps < 0) {
      effectiveIntervalMs *= 0.8;
    }

    if (now - order.lastSliceAt < effectiveIntervalMs) continue;

    const nextSliceIndex = order.sliceCount + 1; // 1-indexed into sliceQtys
    const scheduledQty = order.sliceQtys[nextSliceIndex] ?? 0;
    const sliceQty = Math.min(scheduledQty, order.totalRemaining);
    if (sliceQty <= 0) continue;

    // Use a small tolerance (0.5 bps of market price) above/below current market
    // to get passive-ish fills that still have a high chance of execution.
    const aggressionTolerance = marketPrice * 0.0005;
    const childLimitPrice = order.side === "BUY"
      ? marketPrice + aggressionTolerance // slightly above ask for fills
      : marketPrice - aggressionTolerance; // slightly below bid for fills

    order.sliceCount += 1;
    const childId = `${order.orderId}-is-${order.sliceCount}`;
    order.lastSliceAt = now;

    console.log(
      `[is-algo] Slice ${order.sliceCount}/${order.numSlices} for ${order.orderId}: ${sliceQty} ${order.asset} @ limit ${
        childLimitPrice.toFixed(4)
      } (mkt ${marketPrice.toFixed(4)}, drift ${
        adverseDriftBps.toFixed(1)
      }bps)`,
    );

    await producer?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: ALGO,
      asset: order.asset,
      side: order.side,
      quantity: sliceQty,
      limitPrice: childLimitPrice,
      marketPrice,
      arrivalPrice: order.arrivalPrice,
      driftBps: rawDriftBps.toFixed(1),
      sliceIndex: order.sliceCount,
      numSlices: order.numSlices,
      ts: now,
    }).catch(() => {});

    await producer?.send("algo.heartbeat", {
      algo: ALGO,
      orderId: order.orderId,
      asset: order.asset,
      event: "slice",
      sliceIndex: order.sliceCount,
      numSlices: order.numSlices,
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

startExpirySweep(activeOrders, producer, "IS", "is-algo");

serveAlgoHealth(PORT, "is", VERSION, () => activeOrders.size);

subscribeNewsSignals("is-algo-news", "is-algo");
