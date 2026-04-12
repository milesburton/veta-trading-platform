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
import { createConsumer, createProducer } from "@veta/messaging";
import { type Desk, settlementDate } from "@veta/settlement";
import { CORS_HEADERS, corsOptions, json } from "@veta/http";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const PARTICIPATION_CAP = Number(Deno.env.get("EMS_PARTICIPATION_CAP")) || 0.20;
const IMPACT_PER_1000 = Number(Deno.env.get("EMS_IMPACT_PER_1000_BPS")) || 1.0;

const COMMISSION_PER_SHARE = 0.005;
const SEC_FEE_RATE = 0.000008;
const FINRA_TAF_PER_SHARE = 0.000119;

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const VENUES = [
  { mic: "XNAS", weight: 30 },
  { mic: "XNYS", weight: 25 },
  { mic: "ARCX", weight: 15 },
  { mic: "BATS", weight: 12 },
  { mic: "EDGX", weight: 8 },
  { mic: "IEX", weight: 6 },
  { mic: "MEMX", weight: 4 },
] as const;
type VenueMIC = (typeof VENUES)[number]["mic"];

const VENUE_SPREAD_MULT: Record<string, number> = {
  XNAS: 1.00,
  ARCX: 1.08,
  BATS: 0.95,
  EDGX: 0.98,
  IEX: 1.02,
  MEMX: 0.97,
  XNYS: 1.05,
};
const VENUE_DEPTH_MULT: Record<string, number> = {
  XNAS: 1.00,
  ARCX: 0.85,
  BATS: 0.90,
  EDGX: 0.75,
  IEX: 0.95,
  MEMX: 0.65,
  XNYS: 1.20,
};
const VALID_VENUES = new Set(Object.keys(VENUE_SPREAD_MULT));

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

function pickWeightedVenue(): VenueMIC {
  const total = VENUES.reduce((s, v) => s + v.weight, 0);
  let cumulativeWeight = Math.random() * total;
  for (const v of VENUES) {
    cumulativeWeight -= v.weight;
    if (cumulativeWeight <= 0) return v.mic;
  }
  return VENUES[0].mic;
}
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
  console.warn(
    "[ems] Redpanda unavailable — fills will not be published to bus:",
    err.message,
  );
  return null;
});

interface ChildOrder {
  childId: string;
  parentOrderId: string;
  clientOrderId?: string;
  algo: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice?: number;
  marketPrice?: number;
  venue?: string;
  effectivePrice?: number;
  sliceIndex?: number;
  numSlices?: number;
  vwap?: number;
  deviation?: number;
  tickVolume?: number;
  algoParams?: Record<string, unknown>;
  instrumentType?: string;
  desk?: string;
  marketType?: string;
  userId?: string;
  ts: number;
}

const consumer = await createConsumer("ems-child-orders", ["orders.child"])
  .catch((err) => {
    console.warn("[ems] Cannot subscribe to orders.child:", err.message);
    return null;
  });

let fillSeq = 1;

consumer?.onMessage(async (_topic, raw) => {
  const child = raw as ChildOrder;
  const tick = marketClient.getLatest();
  const midPrice = tick.prices[child.asset];

  if (!midPrice) {
    console.warn(
      `[ems] Unknown asset ${child.asset} — cannot fill ${child.childId}`,
    );
    return;
  }

  const venue = (child.venue && VALID_VENUES.has(child.venue))
    ? child.venue as VenueMIC
    : pickWeightedVenue();

  const depthMult = VENUE_DEPTH_MULT[venue] ?? 1.0;
  const spreadMult = VENUE_SPREAD_MULT[venue] ?? 1.0;
  const tickVolume = tick.volumes[child.asset] ?? 1_000;
  const maxFill = Math.floor(tickVolume * PARTICIPATION_CAP * depthMult);
  const filledQty = Math.min(child.quantity, maxFill);
  const remainingQty = child.quantity - filledQty;
  const impactBps = (filledQty / 1_000) * IMPACT_PER_1000 * spreadMult;
  const impactFactor = child.side === "BUY"
    ? 1 + impactBps / 10_000
    : 1 - impactBps / 10_000;
  const avgFillPrice = parseFloat(
    (child.effectivePrice ?? midPrice * impactFactor).toFixed(4),
  );

  const counterparty = pickCounterparty();
  const liquidityFlag = pickLiquidityFlag(venue);
  const sd = settlementDate(deskFromOrder(child));
  const commissionPerShare = liquidityFlag === "MAKER"
    ? -0.002
    : COMMISSION_PER_SHARE;
  const commissionUSD = parseFloat((filledQty * commissionPerShare).toFixed(2));
  const notional = filledQty * avgFillPrice;
  const secFeeUSD = child.side === "SELL"
    ? parseFloat((notional * SEC_FEE_RATE).toFixed(4))
    : 0;
  const finraTafUSD = child.side === "SELL"
    ? parseFloat(Math.min(filledQty * FINRA_TAF_PER_SHARE, 5.95).toFixed(4))
    : 0;
  const totalFeeUSD = parseFloat(
    (commissionUSD + secFeeUSD + finraTafUSD).toFixed(4),
  );

  const execId = `EX${String(fillSeq++).padStart(8, "0")}`;

  console.log(
    `[ems] Fill ${execId}: ${child.side} ${filledQty}/${child.quantity} ${child.asset} ` +
      `@ ${avgFillPrice} via ${venue} (${liquidityFlag}) impact=${
        impactBps.toFixed(2)
      }bps`,
  );

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
});

console.log(`[ems] Listening for orders.child on message bus`);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return corsOptions();
  if (url.pathname === "/health" && req.method === "GET") {
    return json({ service: "ems", version: VERSION, status: "ok" });
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
