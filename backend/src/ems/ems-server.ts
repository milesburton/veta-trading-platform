import "@veta/bootstrap";
/**
 * Execution Management System (EMS)
 *
 * Subscribes to "orders.child" from the message bus (published by algo services).
 * Computes fills using current market data, then publishes:
 *   - "orders.filled"  — fill confirmation with all execution enrichment fields
 *   - "fix.execution"  — FIX-style execution report for the archive
 *
 * No longer accepts direct HTTP order submission from algos.
 * HTTP surface (internal only): GET /health
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "@veta/market-client";
import { createProducer, createTypedConsumer } from "@veta/messaging";
import { OrderChildSchema } from "@veta/schemas/orders";
import type { OrderChild } from "@veta/schemas/orders";
import { type Desk, settlementDate } from "@veta/settlement";
import { CORS_HEADERS, corsOptions, json } from "@veta/http";
import { logger } from "@veta/logger";
import {
  computeFees,
  computeFill,
  computeImpactBps,
  execId as makeExecId,
  IMPACT_PER_1000_DEFAULT,
  PARTICIPATION_CAP_DEFAULT,
  pickWeightedVenue,
  VALID_VENUES,
  type VenueMIC,
} from "./fill-math.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const PARTICIPATION_CAP =
  Number(Deno.env.get("EMS_PARTICIPATION_CAP")) || PARTICIPATION_CAP_DEFAULT;
const IMPACT_PER_1000 =
  Number(Deno.env.get("EMS_IMPACT_PER_1000_BPS")) || IMPACT_PER_1000_DEFAULT;

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const COUNTERPARTIES = [
  "GSCO",
  "MSCO",
  "JPMS",
  "BAML",
  "CITI",
  "UBSS",
  "DBSI",
  "BARX",
  "MKTX",
  "VIRX",
  "CITD",
  "SUSG",
  "GETC",
  "JNST",
  "TWOC",
];

function pickCounterparty(): string {
  return COUNTERPARTIES[Math.floor(Math.random() * COUNTERPARTIES.length)];
}
function pickLiquidityFlag(venue: string): "MAKER" | "TAKER" | "CROSS" {
  const r = Math.random();
  const makerBias = (venue === "BATS" || venue === "EDGX") ? 0.65 : 0.40;
  return r < makerBias ? "MAKER" : r < 0.95 ? "TAKER" : "CROSS";
}
function deskFromOrder(order: ChildOrder): Desk {
  if (order.instrumentType === "bond") return "fi";
  if (order.instrumentType === "option") return "derivatives";
  return "equity";
}

const producer = await createProducer("ems").catch((err) => {
  logger.warn("Redpanda unavailable — fills will not be published to bus", { err });
  return null;
});

type ChildOrder = OrderChild;

let fillSeq = 1;

async function handleChildOrder(child: ChildOrder): Promise<void> {
  const tick = marketClient.getLatest();
  const midPrice = tick.prices[child.asset];

  if (!midPrice) {
    logger.warn(`Unknown asset ${child.asset} — cannot fill ${child.childId}`);
    return;
  }

  const venue = (child.venue && VALID_VENUES.has(child.venue))
    ? child.venue as VenueMIC
    : pickWeightedVenue();

  const tickVolume = tick.volumes[child.asset] ?? 1_000;
  const { filledQty, remainingQty } = computeFill(
    child.quantity,
    tickVolume,
    venue,
    PARTICIPATION_CAP,
  );
  const impactBps = computeImpactBps(filledQty, venue, IMPACT_PER_1000);
  const impactFactor = child.side === "BUY"
    ? 1 + impactBps / 10_000
    : 1 - impactBps / 10_000;
  const avgFillPrice = parseFloat(
    (child.effectivePrice ?? midPrice * impactFactor).toFixed(4),
  );

  const counterparty = pickCounterparty();
  const liquidityFlag = pickLiquidityFlag(venue);
  const sd = settlementDate(deskFromOrder(child));
  const { commissionUSD, secFeeUSD, finraTafUSD, totalFeeUSD } = computeFees(
    filledQty,
    avgFillPrice,
    child.side,
    liquidityFlag,
  );

  const execId = makeExecId(fillSeq++);

  logger.info(`Fill ${execId}: ${child.side} ${filledQty}/${child.quantity} ${child.asset} ` +
      `@ ${avgFillPrice} via ${venue} (${liquidityFlag}) impact=${
        impactBps.toFixed(2)
      }bps`);

  if (filledQty > 0) {
    const fillPayload = {
      execId,
      childId: child.childId,
      parentOrderId: child.parentOrderId,
      clientOrderId: child.clientOrderId,
      userId: child.userId,
      algo: child.algo,
      asset: child.asset,
      side: child.side,
      requestedQty: child.quantity,
      filledQty,
      remainingQty,
      avgFillPrice,
      midPrice,
      marketImpactBps: impactBps,
      venue,
      counterparty,
      liquidityFlag,
      commissionUSD,
      secFeeUSD,
      finraTafUSD,
      totalFeeUSD,
      settlementDate: sd,
      desk: child.desk ?? deskFromOrder(child),
      marketType: child.marketType ?? "lit",
      ts: Date.now(),
    };

    await producer?.send("orders.filled", fillPayload).catch(() => {});

    await producer?.send("fix.execution", {
      execId,
      clOrdId: child.childId,
      origClOrdId: child.parentOrderId,
      symbol: child.asset,
      side: child.side === "BUY" ? "1" : "2",
      ordType: "2", // Limit
      execType: remainingQty === 0 ? "2" : "1", // 2=Fill, 1=PartialFill
      ordStatus: remainingQty === 0 ? "2" : "1",
      leavesQty: remainingQty,
      cumQty: filledQty,
      avgPx: avgFillPrice,
      lastQty: filledQty,
      lastPx: avgFillPrice,
      venue,
      counterparty,
      commission: commissionUSD,
      settlDate: sd,
      transactTime: new Date().toISOString(),
      ts: Date.now(),
    }).catch(() => {});
  }
}

const consumer = await createTypedConsumer("ems-child-orders", [
  { topic: "orders.child", schema: OrderChildSchema, handler: handleChildOrder },
]).catch((err) => {
  logger.warn("Cannot subscribe to orders.child", { err });
  return null;
});

logger.info(`Listening for orders.child on message bus (consumer=${consumer ? "ok" : "skipped"})`);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return corsOptions();
  if (url.pathname === "/health" && req.method === "GET") {
    return json({ service: "ems", version: VERSION, status: "ok" });
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
