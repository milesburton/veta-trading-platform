/**
 * Central Counterparty Clearing (CCP) Service
 *
 * Interposes itself as the legal counterparty to every trade (novation),
 * manages margin accounts, and tracks settlement obligations.
 *
 * Consumes:
 *   "orders.filled"   — lit-market and dark-pool fills (from EMS + dark-pool)
 *   "rfq.executed"    — FI bond executions (from rfq-service)
 *
 * On each fill, the CCP:
 *   1. Novates the trade — replaces the bilateral counterparty relationship
 *      with two CCP-vs-participant legs
 *   2. Posts initial margin to both buyer and seller accounts
 *      (equity 10% notional, FI 2%, derivatives 15%)
 *   3. Adds the trade to the settlement queue at the correct settlement date
 *   4. Publishes "ccp.novation"  — novation record for each leg
 *   5. Publishes "ccp.margin"    — margin call events
 *   6. Publishes "ccp.settlement.queued" — settlement obligation added
 *
 * A daily settlement sweep (every SETTLEMENT_SWEEP_MS) processes obligations
 * whose settlement date has arrived and publishes "ccp.settlement.complete".
 *
 * Margin is marked-to-market every MARGIN_MTM_MS using the latest prices
 * from market-sim. Variation margin calls are published when exposure
 * exceeds the maintenance margin threshold.
 *
 * HTTP surface:
 *   GET /health
 *   GET /ccp/margin/:userId         — account margin summary
 *   GET /ccp/settlements            — pending settlement queue
 *   GET /ccp/settlements/:date      — obligations for a specific date
 *   GET /ccp/stats                  — aggregate clearing stats
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createMarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { CORS_HEADERS, corsOptions, json } from "../lib/http.ts";

const PORT = Number(Deno.env.get("CCP_SERVICE_PORT")) || 5_028;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";

/** How often to run the settlement sweep (ms). */
const SETTLEMENT_SWEEP_MS = Number(Deno.env.get("CCP_SETTLEMENT_SWEEP_MS")) ||
  30_000;

/** How often to mark-to-market margin positions (ms). */
const MARGIN_MTM_MS = Number(Deno.env.get("CCP_MARGIN_MTM_MS")) || 10_000;

const INITIAL_MARGIN_RATE: Record<string, number> = {
  equity: 0.10, // 10% of notional
  fi: 0.02, //  2% of notional (bonds are lower risk)
  derivatives: 0.15, // 15% of notional (options carry more risk)
  otc: 0.05, //  5% default for OTC
};
const _MAINTENANCE_MARGIN_RATE: Record<string, number> = {
  equity: 0.07,
  fi: 0.015,
  derivatives: 0.10,
  otc: 0.035,
};

interface Fill {
  execId: string;
  childId?: string;
  parentOrderId?: string;
  clientOrderId?: string;
  userId?: string;
  algo?: string;
  asset: string;
  side: "BUY" | "SELL";
  filledQty: number;
  avgFillPrice: number;
  venue?: string;
  counterparty?: string;
  settlementDate?: string;
  desk?: string;
  marketType?: string;
  ts: number;
}

interface RfqExecution {
  execId: string;
  rfqId: string;
  orderId: string;
  clientOrderId?: string;
  userId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  notional: number;
  dealerId: string;
  settlementDate?: string;
  desk?: string;
  ts: number;
}

interface NovationLeg {
  legId: string;
  tradeId: string;
  execId: string;
  userId: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  notional: number;
  desk: string;
  marketType: string;
  originalCounterparty: string;
  settlementDate: string;
  createdAt: number;
  settled: boolean;
}

interface MarginAccount {
  userId: string;
  /** Initial margin posted (USD) across all open positions. */
  initialMarginPosted: number;
  /** Current mark-to-market P&L (USD). Positive = gain, negative = loss. */
  unrealisedPnl: number;
  /** Net margin requirement after MtM. */
  netMarginRequired: number;
  /** Open positions: asset → net qty (positive = long, negative = short). */
  positions: Record<string, number>;
  /** Average cost basis per asset (USD per share/unit). */
  costBasis: Record<string, number>;
  lastUpdated: number;
}

interface SettlementObligation {
  obligationId: string;
  legId: string;
  userId: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  notional: number;
  desk: string;
  settlementDate: string;
  settled: boolean;
  settledAt?: number;
}

const novationLegs = new Map<string, NovationLeg>();
const marginAccounts = new Map<string, MarginAccount>();
const settlementQueue = new Map<string, SettlementObligation>();

let tradeSeq = 1;
let legSeq = 1;
let obligationSeq = 1;

let totalNovated = 0;
let totalSettled = 0;
let totalMarginCalls = 0;

function nextTradeId(): string {
  return `CCP-T${String(tradeSeq++).padStart(8, "0")}`;
}
function nextLegId(): string {
  return `CCP-L${String(legSeq++).padStart(8, "0")}`;
}
function nextObligationId(): string {
  return `CCP-O${String(obligationSeq++).padStart(8, "0")}`;
}

const marketClient = createMarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("ccp-service").catch((err) => {
  console.warn("[ccp] Redpanda unavailable:", err.message);
  return null;
});

const fillsConsumer = await createConsumer("ccp-fills", ["orders.filled"])
  .catch((err) => {
    console.warn("[ccp] Cannot subscribe to orders.filled:", err.message);
    return null;
  });

const rfqConsumer = await createConsumer("ccp-rfq", ["rfq.executed"]).catch(
  (err) => {
    console.warn("[ccp] Cannot subscribe to rfq.executed:", err.message);
    return null;
  },
);

function getOrCreateMarginAccount(userId: string): MarginAccount {
  let acct = marginAccounts.get(userId);
  if (!acct) {
    acct = {
      userId,
      initialMarginPosted: 0,
      unrealisedPnl: 0,
      netMarginRequired: 0,
      positions: {},
      costBasis: {},
      lastUpdated: Date.now(),
    };
    marginAccounts.set(userId, acct);
  }
  return acct;
}

function updatePosition(
  acct: MarginAccount,
  asset: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number,
): void {
  const sign = side === "BUY" ? 1 : -1;
  const currentQty = acct.positions[asset] ?? 0;
  const currentCost = acct.costBasis[asset] ?? 0;

  const newQty = currentQty + sign * qty;

  if (Math.abs(newQty) < 0.0001) {
    delete acct.positions[asset];
    delete acct.costBasis[asset];
  } else if (sign > 0) {
    const totalCost = Math.abs(currentQty) * currentCost + qty * price;
    acct.positions[asset] = newQty;
    acct.costBasis[asset] = totalCost / Math.abs(newQty);
  } else {
    acct.positions[asset] = newQty;
    acct.costBasis[asset] = currentCost;
  }
}

async function postInitialMargin(
  userId: string,
  desk: string,
  notional: number,
  asset: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number,
  execId: string,
): Promise<void> {
  const acct = getOrCreateMarginAccount(userId);
  const rate = INITIAL_MARGIN_RATE[desk] ?? 0.10;
  const marginRequired = parseFloat((notional * rate).toFixed(2));

  acct.initialMarginPosted += marginRequired;
  acct.netMarginRequired += marginRequired;
  acct.lastUpdated = Date.now();

  updatePosition(acct, asset, side, qty, price);

  await producer?.send("ccp.margin", {
    type: "initial",
    userId,
    asset,
    desk,
    marginRequired,
    totalMarginPosted: acct.initialMarginPosted,
    notional,
    execId,
    ts: Date.now(),
  }).catch(() => {});

  totalMarginCalls++;
}

async function novate(
  execId: string,
  userId: string,
  asset: string,
  side: "BUY" | "SELL",
  quantity: number,
  price: number,
  notional: number,
  desk: string,
  marketType: string,
  originalCounterparty: string,
  settlDate: string,
): Promise<void> {
  const tradeId = nextTradeId();
  const legId = nextLegId();
  const obligationId = nextObligationId();
  const now = Date.now();

  const leg: NovationLeg = {
    legId,
    tradeId,
    execId,
    userId,
    asset,
    side,
    quantity,
    price,
    notional,
    desk,
    marketType,
    originalCounterparty,
    settlementDate: settlDate,
    createdAt: now,
    settled: false,
  };

  novationLegs.set(legId, leg);

  const obligation: SettlementObligation = {
    obligationId,
    legId,
    userId,
    asset,
    side,
    quantity,
    price,
    notional,
    desk,
    settlementDate: settlDate,
    settled: false,
  };
  settlementQueue.set(obligationId, obligation);

  totalNovated++;

  console.log(
    `[ccp] Novated ${tradeId}: ${side} ${quantity} ${asset} @ ${price} ` +
      `desk=${desk} user=${userId} settle=${settlDate}`,
  );

  await producer?.send("ccp.novation", {
    tradeId,
    legId,
    execId,
    userId,
    asset,
    side,
    quantity,
    price,
    notional,
    desk,
    marketType,
    originalCounterparty,
    ccpCounterparty: "VETA-CCP",
    settlementDate: settlDate,
    ts: now,
  }).catch(() => {});

  await producer?.send("ccp.settlement.queued", {
    obligationId,
    legId,
    tradeId,
    userId,
    asset,
    side,
    quantity,
    price,
    notional,
    desk,
    settlementDate: settlDate,
    ts: now,
  }).catch(() => {});

  await postInitialMargin(
    userId,
    desk,
    notional,
    asset,
    side,
    quantity,
    price,
    execId,
  );
}

fillsConsumer?.onMessage((_topic, raw) => {
  const fill = raw as Fill;
  if (
    !fill.execId || !fill.userId || !fill.asset || !fill.filledQty ||
    !fill.avgFillPrice
  ) return;
  if (fill.filledQty <= 0) return;

  const desk = fill.desk ?? "equity";
  const marketType = fill.marketType ?? "lit";
  const notional = parseFloat((fill.filledQty * fill.avgFillPrice).toFixed(2));
  const counterparty = fill.counterparty ?? "UNKNOWN";

  // Settlement date from the fill payload; fall back to T+2 for equity
  const settlDate = fill.settlementDate ??
    new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

  novate(
    fill.execId,
    fill.userId,
    fill.asset,
    fill.side,
    fill.filledQty,
    fill.avgFillPrice,
    notional,
    desk,
    marketType,
    counterparty,
    settlDate,
  )
    .catch(console.error);
});

rfqConsumer?.onMessage((_topic, raw) => {
  const exec = raw as RfqExecution;
  if (
    !exec.execId || !exec.userId || !exec.asset || !exec.quantity || !exec.price
  ) return;

  const desk = exec.desk ?? "fi";
  const settlDate = exec.settlementDate ??
    new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  novate(
    exec.execId,
    exec.userId,
    exec.asset,
    exec.side,
    exec.quantity,
    exec.price,
    exec.notional,
    desk,
    "otc",
    exec.dealerId,
    settlDate,
  )
    .catch(console.error);
});

async function runSettlementSweep(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  for (const [id, obligation] of settlementQueue) {
    if (obligation.settled) continue;
    if (obligation.settlementDate > today) continue;

    obligation.settled = true;
    obligation.settledAt = Date.now();

    // Mark the novation leg as settled
    const leg = novationLegs.get(obligation.legId);
    if (leg) leg.settled = true;

    // Release initial margin for this position
    const acct = marginAccounts.get(obligation.userId);
    if (acct) {
      const rate = INITIAL_MARGIN_RATE[obligation.desk] ?? 0.10;
      const release = parseFloat((obligation.notional * rate).toFixed(2));
      acct.initialMarginPosted = Math.max(
        0,
        acct.initialMarginPosted - release,
      );
      acct.netMarginRequired = Math.max(0, acct.netMarginRequired - release);
      // Remove settled position from the account
      const sign = obligation.side === "BUY" ? 1 : -1;
      const pos = acct.positions[obligation.asset] ?? 0;
      const newPos = pos - sign * obligation.quantity;
      if (Math.abs(newPos) < 0.0001) {
        delete acct.positions[obligation.asset];
        delete acct.costBasis[obligation.asset];
      } else {
        acct.positions[obligation.asset] = newPos;
      }
      acct.lastUpdated = Date.now();
    }

    totalSettled++;

    console.log(
      `[ccp] Settled ${obligation.obligationId}: ${obligation.side} ${obligation.quantity} ${obligation.asset}`,
    );

    await producer?.send("ccp.settlement.complete", {
      obligationId: id,
      legId: obligation.legId,
      userId: obligation.userId,
      asset: obligation.asset,
      side: obligation.side,
      quantity: obligation.quantity,
      price: obligation.price,
      notional: obligation.notional,
      desk: obligation.desk,
      settlementDate: obligation.settlementDate,
      settledAt: obligation.settledAt,
      ts: Date.now(),
    }).catch(() => {});

    // Clean up settled obligations older than 24h
    settlementQueue.delete(id);
  }
}

async function runMarginMtM(): Promise<void> {
  const tick = marketClient.getLatest();
  const now = Date.now();

  for (const [userId, acct] of marginAccounts) {
    let unrealisedPnl = 0;

    for (const [asset, qty] of Object.entries(acct.positions)) {
      const currentPrice = tick.prices[asset];
      if (!currentPrice || Math.abs(qty) < 0.0001) continue;
      const costBasis = acct.costBasis[asset] ?? currentPrice;
      unrealisedPnl += qty * (currentPrice - costBasis);
    }

    acct.unrealisedPnl = parseFloat(unrealisedPnl.toFixed(2));

    // Check if margin has fallen below maintenance threshold
    const maintenanceRequired = acct.netMarginRequired *
      (Object.keys(acct.positions).length > 0 ? 0.7 : 1); // maintenance is 70% of initial

    const effectiveMargin = acct.initialMarginPosted + acct.unrealisedPnl;

    if (acct.initialMarginPosted > 0 && effectiveMargin < maintenanceRequired) {
      const variationCall = parseFloat(
        (acct.netMarginRequired - effectiveMargin).toFixed(2),
      );
      if (variationCall > 0) {
        totalMarginCalls++;
        await producer?.send("ccp.margin", {
          type: "variation",
          userId,
          variationCall,
          effectiveMargin,
          maintenanceRequired,
          unrealisedPnl: acct.unrealisedPnl,
          ts: now,
        }).catch(() => {});
      }
    }

    acct.lastUpdated = now;
  }
}

setInterval(() => {
  runSettlementSweep().catch(console.error);
}, SETTLEMENT_SWEEP_MS);
setInterval(() => {
  runMarginMtM().catch(console.error);
}, MARGIN_MTM_MS);

console.log(`[ccp] Listening for orders.filled and rfq.executed`);
console.log(
  `[ccp] Settlement sweep=${SETTLEMENT_SWEEP_MS}ms  MtM=${MARGIN_MTM_MS}ms`,
);

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return corsOptions();

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "ccp-service",
      version: VERSION,
      status: "ok",
    });
  }

  // GET /ccp/stats
  if (path === "/ccp/stats" && req.method === "GET") {
    const pendingObligations = [...settlementQueue.values()].filter((o) =>
      !o.settled
    );
    const pendingByDate = pendingObligations.reduce<Record<string, number>>(
      (acc, o) => {
        acc[o.settlementDate] = (acc[o.settlementDate] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return json({
      service: "ccp-service",
      version: VERSION,
      totalNovated,
      totalSettled,
      totalMarginCalls,
      pendingObligations: pendingObligations.length,
      pendingByDate,
      marginAccountCount: marginAccounts.size,
      ts: Date.now(),
    });
  }

  // GET /ccp/margin/:userId
  const marginMatch = path.match(/^\/ccp\/margin\/([^/]+)$/);
  if (marginMatch && req.method === "GET") {
    const acct = marginAccounts.get(marginMatch[1]);
    if (!acct) {
      return json({
        userId: marginMatch[1],
        initialMarginPosted: 0,
        unrealisedPnl: 0,
        netMarginRequired: 0,
        positions: {},
        costBasis: {},
      });
    }
    return json(acct);
  }

  // GET /ccp/settlements — pending queue
  if (path === "/ccp/settlements" && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    let obligations = [...settlementQueue.values()].filter((o) => !o.settled);
    if (userId) obligations = obligations.filter((o) => o.userId === userId);
    obligations.sort((a, b) =>
      a.settlementDate.localeCompare(b.settlementDate)
    );
    return json({ obligations, total: obligations.length });
  }

  // GET /ccp/settlements/:date — obligations for a specific date
  const settlDateMatch = path.match(
    /^\/ccp\/settlements\/(\d{4}-\d{2}-\d{2})$/,
  );
  if (settlDateMatch && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    let obligations = [...settlementQueue.values()].filter(
      (o) => o.settlementDate === settlDateMatch[1],
    );
    if (userId) obligations = obligations.filter((o) => o.userId === userId);
    return json({
      date: settlDateMatch[1],
      obligations,
      total: obligations.length,
    });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
