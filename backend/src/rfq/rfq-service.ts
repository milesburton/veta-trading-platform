/**
 * Fixed Income RFQ (Request for Quote) Service
 *
 * Implements a dealer-driven RFQ workflow for bond orders.
 *
 * Flow:
 *   1. OMS publishes bond orders to "orders.fi.rfq"
 *   2. RFQ service creates an RFQ record (state: PENDING)
 *   3. Service sends the RFQ to 3–5 simulated dealers in parallel
 *   4. Dealers respond with quotes after a random delay (50–800ms)
 *   5. Best quote (tightest spread) auto-executes after QUOTE_WINDOW_MS
 *   6. On execution:
 *      - Publishes "rfq.executed"      — full trade record
 *      - Publishes "orders.filled"     — mirrors EMS shape (picked up by journal/gateway)
 *      - Publishes "fix.execution"     — consumed by fix-archive
 *      - Publishes "rfq.quote.update"  — real-time quote feed for the frontend
 *   7. Unexecuted RFQs expire after QUOTE_WINDOW_MS
 *
 * HTTP surface:
 *   GET  /health
 *   GET  /rfq/:id        — fetch single RFQ with quotes
 *   GET  /rfq            — list recent RFQs (last 100)
 *   POST /rfq/:id/execute — manually select a specific dealer quote
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { settlementDate } from "../lib/settlement.ts";

// ── Sell-side RFQ types ────────────────────────────────────────────────────────

type SellSideRfqState =
  | "CLIENT_REQUEST"      // client submitted
  | "SALES_REVIEW"        // waiting for sales to route
  | "DEALER_QUOTE"        // dealer simulation running (for FI) or just pricing (for equity)
  | "SALES_MARKUP"        // sales applies markup before sending to client
  | "CLIENT_CONFIRMATION" // sent to client, awaiting accept/reject
  | "CONFIRMED"           // client accepted, order placed
  | "REJECTED";           // rejected at any stage

interface SellSideRfq {
  rfqId: string;
  state: SellSideRfqState;
  clientUserId: string;
  salesUserId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice?: number;
  // Dealer/pricing layer
  dealerBestPrice?: number;      // best price from dealer sim or live price
  dealerBestYield?: number;      // for bonds
  dealerSpreadBps?: number;
  // Sales markup
  salesMarkupBps?: number;
  clientQuotedPrice?: number;    // price shown to client after markup
  // Rejection
  rejectedBy?: string;
  rejectionReason?: string;
  // Timestamps
  createdAt: number;
  salesRoutedAt?: number;
  salesMarkupAppliedAt?: number;
  clientConfirmedAt?: number;
  ts: number;
}

// ── Sell-side RFQ state ────────────────────────────────────────────────────────

const sellSideRfqStore = new Map<string, SellSideRfq>();
let ssRfqSeq = 1;
function nextSsRfqId(): string {
  return `SSRFQ${String(ssRfqSeq++).padStart(6, "0")}`;
}

const PORT = Number(Deno.env.get("RFQ_SERVICE_PORT")) || 5_029;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

/** How long (ms) to collect dealer quotes before auto-executing the best. */
const QUOTE_WINDOW_MS = Number(Deno.env.get("RFQ_QUOTE_WINDOW_MS")) || 3_000;

/** How long (ms) to keep completed RFQs in memory before pruning. */
const RFQ_RETENTION_MS = Number(Deno.env.get("RFQ_RETENTION_MS")) || 300_000; // 5 minutes

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Simulated dealers ─────────────────────────────────────────────────────────

interface DealerProfile {
  id: string;
  name: string;
  /** Base spread over mid-yield in bps — lower is tighter/better. */
  baseSpreadBps: number;
  /** How often this dealer responds (0–1). */
  responseRate: number;
  /** Response latency range [minMs, maxMs]. */
  latencyMs: [number, number];
  /** Specialisation: UST dealers quote tighter on treasuries, corp dealers on IG. */
  specialisation: "UST" | "Corp" | "all";
}

const DEALERS: DealerProfile[] = [
  { id: "GSCO", name: "Goldman Sachs",      baseSpreadBps: 2.5, responseRate: 0.97, latencyMs: [60,  400], specialisation: "all"  },
  { id: "MSCO", name: "Morgan Stanley",     baseSpreadBps: 3.0, responseRate: 0.95, latencyMs: [80,  500], specialisation: "UST"  },
  { id: "JPMS", name: "JPMorgan",           baseSpreadBps: 2.8, responseRate: 0.96, latencyMs: [50,  350], specialisation: "all"  },
  { id: "BAML", name: "BofA Securities",    baseSpreadBps: 3.2, responseRate: 0.93, latencyMs: [100, 600], specialisation: "Corp" },
  { id: "CITI", name: "Citi",               baseSpreadBps: 3.5, responseRate: 0.90, latencyMs: [120, 700], specialisation: "Corp" },
  { id: "BARX", name: "Barclays",           baseSpreadBps: 3.8, responseRate: 0.88, latencyMs: [150, 800], specialisation: "UST"  },
  { id: "DBSI", name: "Deutsche Bank",      baseSpreadBps: 4.0, responseRate: 0.82, latencyMs: [200, 800], specialisation: "Corp" },
];

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BondSpec {
  isin: string;
  symbol: string;
  description: string;
  couponRate: number;
  maturityDate: string;
  totalPeriods: number;
  periodsPerYear: number;
  faceValue: number;
  yieldAtOrder: number;
  creditRating: string;
}

interface RfqRequest {
  orderId: string;
  clientOrderId?: string;
  userId?: string;
  userRole?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  bondSpec: BondSpec;
  desk?: string;
  routedAt: number;
  ts: number;
}

interface DealerQuote {
  dealerId: string;
  dealerName: string;
  /** Clean price as fraction of face (e.g. 0.9923) */
  price: number;
  /** Yield to maturity (decimal) */
  yield: number;
  /** Spread over reference yield (bps) */
  spreadBps: number;
  /** Notional USD for this quote */
  notional: number;
  receivedAt: number;
}

type RfqState = "PENDING" | "QUOTED" | "EXECUTED" | "EXPIRED" | "NO_QUOTES";

interface RfqRecord {
  rfqId: string;
  orderId: string;
  clientOrderId?: string;
  userId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  bondSpec: BondSpec;
  desk: string;
  state: RfqState;
  quotes: DealerQuote[];
  bestQuote?: DealerQuote;
  executedQuote?: DealerQuote;
  execId?: string;
  createdAt: number;
  executedAt?: number;
  expiresAt: number;
  settlementDate: string;
}

// ── State ─────────────────────────────────────────────────────────────────────

const rfqStore = new Map<string, RfqRecord>();
let rfqSeq = 1;
let execSeq = 1;

function nextRfqId(): string {
  return `RFQ${String(rfqSeq++).padStart(8, "0")}`;
}
function nextExecId(): string {
  return `FI${String(execSeq++).padStart(8, "0")}`;
}

// ── Messaging ─────────────────────────────────────────────────────────────────

const producer = await createProducer("rfq-service").catch((err) => {
  console.warn("[rfq] Redpanda unavailable — executions will not be published:", err.message);
  return null;
});

const consumer = await createConsumer("rfq-service-fi", ["orders.fi.rfq"]).catch((err) => {
  console.warn("[rfq] Cannot subscribe to orders.fi.rfq:", err.message);
  return null;
});

// ── Bond pricing utility ──────────────────────────────────────────────────────

/**
 * Price a bond using the standard present-value formula.
 * Returns clean price as fraction of face value.
 */
function priceBond(spec: BondSpec, yieldAnnual: number): number {
  const { couponRate, totalPeriods, periodsPerYear, faceValue } = spec;
  const r = yieldAnnual / periodsPerYear;
  const couponPayment = faceValue * (couponRate / periodsPerYear);
  if (r === 0) {
    return (couponPayment * totalPeriods + faceValue) / faceValue;
  }
  const pv = couponPayment * (1 - Math.pow(1 + r, -totalPeriods)) / r +
    faceValue * Math.pow(1 + r, -totalPeriods);
  return parseFloat((pv / faceValue).toFixed(6));
}

// ── Dealer simulation ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Simulate a dealer generating a quote for an RFQ.
 * Returns null if the dealer declines to quote.
 */
async function simulateDealerQuote(
  dealer: DealerProfile,
  rfq: RfqRecord,
): Promise<DealerQuote | null> {
  const [minMs, maxMs] = dealer.latencyMs;
  const latency = minMs + Math.random() * (maxMs - minMs);
  await sleep(latency);

  // Dealers that have already been timed out shouldn't respond
  if (Date.now() >= rfq.expiresAt) return null;

  // Response rate — some dealers pass on some RFQs
  if (Math.random() > dealer.responseRate) return null;

  const spec = rfq.bondSpec;
  const baseYield = spec.yieldAtOrder;

  // Specialisation bonus: tighter spreads for preferred instruments
  const isUST = spec.creditRating === "AAA" && spec.isin.startsWith("US9128");
  const specialisationBonus =
    (dealer.specialisation === "UST" && isUST) ? 0.5 :
    (dealer.specialisation === "Corp" && !isUST) ? 0.5 : 0;

  // Add randomness ±30% of base spread
  const jitter = (Math.random() * 0.6 - 0.3) * dealer.baseSpreadBps;
  const spreadBps = Math.max(0.5, dealer.baseSpreadBps - specialisationBonus + jitter);

  // BUY: dealer offers at ask (higher yield = lower price for buyer)
  // SELL: dealer bids at bid (lower yield = higher price for seller)
  const spreadFactor = rfq.side === "BUY" ? 1 : -1;
  const dealerYield = baseYield + (spreadFactor * spreadBps / 10_000);

  const price = priceBond(spec, dealerYield);
  const notional = parseFloat((rfq.quantity * price * spec.faceValue).toFixed(2));

  return {
    dealerId: dealer.id,
    dealerName: dealer.name,
    price,
    yield: parseFloat(dealerYield.toFixed(6)),
    spreadBps: parseFloat(spreadBps.toFixed(2)),
    notional,
    receivedAt: Date.now(),
  };
}

/**
 * Pick the best quote: for a BUY, the lowest yield (highest price);
 * for a SELL, the highest yield (lowest price from buyer's perspective = best for seller).
 */
function selectBestQuote(quotes: DealerQuote[], side: "BUY" | "SELL"): DealerQuote | undefined {
  if (quotes.length === 0) return undefined;
  return quotes.reduce((best, q) =>
    side === "BUY"
      ? (q.yield < best.yield ? q : best)
      : (q.yield > best.yield ? q : best)
  );
}

// ── RFQ execution ─────────────────────────────────────────────────────────────

async function executeRfq(rfq: RfqRecord, quote: DealerQuote): Promise<void> {
  if (rfq.state !== "PENDING" && rfq.state !== "QUOTED") return;

  const execId = nextExecId();
  const now = Date.now();
  const sd = settlementDate("fi");

  rfq.state = "EXECUTED";
  rfq.executedQuote = quote;
  rfq.execId = execId;
  rfq.executedAt = now;

  console.log(
    `[rfq] Execute ${execId}: ${rfq.side} ${rfq.quantity} ${rfq.asset} @ yield=${quote.yield.toFixed(4)} ` +
    `price=${quote.price.toFixed(6)} dealer=${quote.dealerId} notional=${quote.notional}`
  );

  // 1. rfq.executed — full RFQ trade record
  await producer?.send("rfq.executed", {
    execId,
    rfqId: rfq.rfqId,
    orderId: rfq.orderId,
    clientOrderId: rfq.clientOrderId,
    userId: rfq.userId,
    asset: rfq.asset,
    side: rfq.side,
    quantity: rfq.quantity,
    price: quote.price,
    yield: quote.yield,
    spreadBps: quote.spreadBps,
    notional: quote.notional,
    dealerId: quote.dealerId,
    dealerName: quote.dealerName,
    bondSpec: rfq.bondSpec,
    desk: rfq.desk,
    settlementDate: sd,
    ts: now,
  }).catch(() => {});

  // 2. orders.filled — mirrors EMS shape so journal/gateway handle it identically
  await producer?.send("orders.filled", {
    execId,
    childId: `${rfq.orderId}-rfq-${now}`,
    parentOrderId: rfq.orderId,
    clientOrderId: rfq.clientOrderId,
    userId: rfq.userId,
    algo: "RFQ",
    asset: rfq.asset,
    side: rfq.side,
    requestedQty: rfq.quantity,
    filledQty: rfq.quantity,
    remainingQty: 0,
    avgFillPrice: parseFloat((quote.price * rfq.bondSpec.faceValue).toFixed(4)),
    midPrice: parseFloat((quote.price * rfq.bondSpec.faceValue).toFixed(4)),
    marketImpactBps: quote.spreadBps,
    venue: "RFQ",
    counterparty: quote.dealerId,
    liquidityFlag: "TAKER",
    commissionUSD: 0,
    secFeeUSD: rfq.side === "SELL"
      ? parseFloat((quote.notional * 0.000008).toFixed(4))
      : 0,
    finraTafUSD: 0,
    totalFeeUSD: rfq.side === "SELL"
      ? parseFloat((quote.notional * 0.000008).toFixed(4))
      : 0,
    settlementDate: sd,
    desk: rfq.desk,
    marketType: "otc",
    ts: now,
  }).catch(() => {});

  // 3. fix.execution — consumed by fix-archive
  await producer?.send("fix.execution", {
    execId,
    clOrdId: `${rfq.orderId}-rfq-${now}`,
    origClOrdId: rfq.orderId,
    symbol: rfq.asset,
    side: rfq.side === "BUY" ? "1" : "2",
    ordType: "2", // Limit
    execType: "2", // Fill
    ordStatus: "2", // Filled
    leavesQty: 0,
    cumQty: rfq.quantity,
    avgPx: parseFloat((quote.price * rfq.bondSpec.faceValue).toFixed(4)),
    lastQty: rfq.quantity,
    lastPx: parseFloat((quote.price * rfq.bondSpec.faceValue).toFixed(4)),
    venue: "RFQ",
    counterparty: quote.dealerId,
    commission: 0,
    settlDate: sd,
    transactTime: new Date(now).toISOString(),
    ts: now,
  }).catch(() => {});

  // 4. rfq.quote.update — real-time state push to frontend
  await producer?.send("rfq.quote.update", {
    rfqId: rfq.rfqId,
    orderId: rfq.orderId,
    userId: rfq.userId,
    state: "EXECUTED",
    execId,
    executedQuote: quote,
    allQuotes: rfq.quotes,
    ts: now,
  }).catch(() => {});
}

async function expireRfq(rfq: RfqRecord): Promise<void> {
  const newState: RfqState = rfq.quotes.length > 0 ? "EXPIRED" : "NO_QUOTES";
  rfq.state = newState;
  console.log(`[rfq] RFQ ${rfq.rfqId} ${newState} (${rfq.quotes.length} quotes received)`);

  await producer?.send("rfq.quote.update", {
    rfqId: rfq.rfqId,
    orderId: rfq.orderId,
    userId: rfq.userId,
    state: newState,
    allQuotes: rfq.quotes,
    ts: Date.now(),
  }).catch(() => {});

  // Publish orders.expired so journal marks the parent order
  await producer?.send("orders.expired", {
    orderId: rfq.orderId,
    clientOrderId: rfq.clientOrderId,
    userId: rfq.userId,
    asset: rfq.asset,
    side: rfq.side,
    reason: newState === "NO_QUOTES" ? "rfq_no_quotes" : "rfq_expired",
    ts: Date.now(),
  }).catch(() => {});
}

// ── RFQ lifecycle ─────────────────────────────────────────────────────────────

async function processRfq(req: RfqRequest): Promise<void> {
  const now = Date.now();
  const rfqId = nextRfqId();
  const sd = settlementDate("fi");

  const rfq: RfqRecord = {
    rfqId,
    orderId: req.orderId,
    clientOrderId: req.clientOrderId,
    userId: req.userId,
    asset: req.asset,
    side: req.side,
    quantity: req.quantity,
    limitPrice: req.limitPrice,
    bondSpec: req.bondSpec,
    desk: req.desk ?? "fi",
    state: "PENDING",
    quotes: [],
    createdAt: now,
    expiresAt: now + QUOTE_WINDOW_MS,
    settlementDate: sd,
  };

  rfqStore.set(rfqId, rfq);

  console.log(`[rfq] New RFQ ${rfqId}: ${req.side} ${req.quantity} ${req.asset} @ yield=${req.bondSpec.yieldAtOrder.toFixed(4)}`);

  // Notify frontend that RFQ is live
  await producer?.send("rfq.quote.update", {
    rfqId,
    orderId: req.orderId,
    userId: req.userId,
    state: "PENDING",
    allQuotes: [],
    ts: now,
  }).catch(() => {});

  // Send to 4–5 dealers concurrently (random subset weighted by specialisation)
  const candidateDealers = DEALERS.filter((d) => {
    if (d.specialisation === "all") return true;
    const isUST = req.bondSpec.creditRating === "AAA" && req.bondSpec.isin.startsWith("US9128");
    return d.specialisation === "UST" ? isUST : !isUST;
  });
  // Always include all-rounder dealers; pick up to 2 specialist dealers
  const allRounders = candidateDealers.filter((d) => d.specialisation === "all");
  const specialists = candidateDealers.filter((d) => d.specialisation !== "all");
  const selectedSpecialists = specialists.sort(() => Math.random() - 0.5).slice(0, 2);
  const selectedDealers = [...allRounders, ...selectedSpecialists];

  // Fire all dealer requests concurrently; collect responses as they arrive
  const quotePromises = selectedDealers.map(async (dealer) => {
    const quote = await simulateDealerQuote(dealer, rfq);
    if (!quote) return;
    if (rfq.state !== "PENDING" && rfq.state !== "QUOTED") return;

    rfq.quotes.push(quote);
    rfq.state = "QUOTED";
    rfq.bestQuote = selectBestQuote(rfq.quotes, rfq.side);

    // Push live update to frontend on each incoming quote
    await producer?.send("rfq.quote.update", {
      rfqId,
      orderId: req.orderId,
      userId: req.userId,
      state: "QUOTED",
      latestQuote: quote,
      bestQuote: rfq.bestQuote,
      allQuotes: rfq.quotes,
      ts: Date.now(),
    }).catch(() => {});
  });

  // Wait for quote window to close
  await Promise.all([
    Promise.allSettled(quotePromises),
    sleep(QUOTE_WINDOW_MS),
  ]);

  // Auto-execute best quote, or expire
  if (rfq.state === "PENDING" || rfq.state === "QUOTED") {
    const best = selectBestQuote(rfq.quotes, rfq.side);
    if (best) {
      await executeRfq(rfq, best);
    } else {
      await expireRfq(rfq);
    }
  }
}

// ── Consumer ──────────────────────────────────────────────────────────────────

consumer?.onMessage((_topic, raw) => {
  const req = raw as RfqRequest;
  if (!req.bondSpec) {
    console.warn(`[rfq] Ignoring orders.fi.rfq without bondSpec: orderId=${req.orderId}`);
    return;
  }
  processRfq(req).catch(console.error);
});

console.log(`[rfq] Listening for orders.fi.rfq on message bus (window=${QUOTE_WINDOW_MS}ms)`);

// ── Periodic cleanup ──────────────────────────────────────────────────────────

setInterval(() => {
  const cutoff = Date.now() - RFQ_RETENTION_MS;
  for (const [id, rfq] of rfqStore) {
    if (rfq.createdAt < cutoff) rfqStore.delete(id);
  }
}, 60_000);

// ── Sell-side RFQ helpers ─────────────────────────────────────────────────────

async function publishSsRfqUpdate(rfq: SellSideRfq): Promise<void> {
  await producer?.send("rfq.sellside.update", { ...rfq, ts: Date.now() }).catch(() => {});
}

// ── HTTP server ───────────────────────────────────────────────────────────────

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "rfq-service", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  // GET /rfq — list recent RFQs (most recent first, capped at 100)
  if (path === "/rfq" && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    let records = [...rfqStore.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (userId) records = records.filter((r) => r.userId === userId);
    return new Response(
      JSON.stringify({ rfqs: records.slice(0, 100), total: records.length }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  // GET /rfq/stats — must be checked before /rfq/:id to avoid "stats" being treated as an id
  if (path === "/rfq/stats" && req.method === "GET") {
    const all = [...rfqStore.values()];
    const byState = all.reduce<Record<string, number>>((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + 1;
      return acc;
    }, {});
    return new Response(
      JSON.stringify({
        service: "rfq-service",
        version: VERSION,
        total: all.length,
        byState,
        quoteWindowMs: QUOTE_WINDOW_MS,
        ts: Date.now(),
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  // GET /rfq/:id — fetch a single RFQ
  const matchGet = path.match(/^\/rfq\/([^/]+)$/);
  if (matchGet && req.method === "GET") {
    const rfq = rfqStore.get(matchGet[1]);
    if (!rfq) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: CORS_HEADERS });
    return new Response(JSON.stringify(rfq), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  // POST /rfq/:id/execute — manually select a specific dealer quote
  const matchExec = path.match(/^\/rfq\/([^/]+)\/execute$/);
  if (matchExec && req.method === "POST") {
    const rfq = rfqStore.get(matchExec[1]);
    if (!rfq) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: CORS_HEADERS });
    if (rfq.state === "EXECUTED") {
      return new Response(JSON.stringify({ error: "Already executed" }), { status: 409, headers: CORS_HEADERS });
    }
    if (rfq.state === "EXPIRED" || rfq.state === "NO_QUOTES") {
      return new Response(JSON.stringify({ error: "RFQ has expired" }), { status: 410, headers: CORS_HEADERS });
    }

    let selectedQuote: DealerQuote | undefined;
    try {
      const body = await req.json() as { dealerId?: string };
      if (body.dealerId) {
        selectedQuote = rfq.quotes.find((q) => q.dealerId === body.dealerId);
        if (!selectedQuote) {
          return new Response(JSON.stringify({ error: "Dealer quote not found" }), { status: 404, headers: CORS_HEADERS });
        }
      }
    } catch {
      // No body — use best quote
    }

    const quoteToExecute = selectedQuote ?? selectBestQuote(rfq.quotes, rfq.side);
    if (!quoteToExecute) {
      return new Response(JSON.stringify({ error: "No quotes available yet" }), { status: 425, headers: CORS_HEADERS });
    }

    await executeRfq(rfq, quoteToExecute);
    return new Response(JSON.stringify({ execId: rfq.execId, executedQuote: rfq.executedQuote }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // ── Sell-side RFQ routes ──────────────────────────────────────────────────

  // POST /rfq/sellside — client submits a sell-side RFQ
  if (path === "/rfq/sellside" && req.method === "POST") {
    let body: { clientUserId: string; asset: string; side: "BUY" | "SELL"; quantity: number; limitPrice?: number };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
    const { clientUserId, asset, side, quantity, limitPrice } = body;
    if (!clientUserId || !asset || !side || !quantity) {
      return new Response(JSON.stringify({ error: "Missing required fields: clientUserId, asset, side, quantity" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
    const now = Date.now();
    const rfqId = nextSsRfqId();
    const rfq: SellSideRfq = {
      rfqId,
      state: "CLIENT_REQUEST",
      clientUserId,
      asset,
      side,
      quantity,
      limitPrice,
      createdAt: now,
      ts: now,
    };
    sellSideRfqStore.set(rfqId, rfq);
    await publishSsRfqUpdate(rfq);
    console.log(`[rfq] New sell-side RFQ ${rfqId}: ${side} ${quantity} ${asset} from ${clientUserId}`);
    return new Response(JSON.stringify({ rfqId, state: rfq.state }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  // GET /rfq/sellside/stats — must be before /rfq/sellside/:id
  if (path === "/rfq/sellside/stats" && req.method === "GET") {
    const byState = [...sellSideRfqStore.values()].reduce<Record<string, number>>((acc, r) => { acc[r.state] = (acc[r.state] ?? 0) + 1; return acc; }, {});
    return new Response(JSON.stringify({ total: sellSideRfqStore.size, byState }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  // GET /rfq/sellside — list sell-side RFQs
  if (path === "/rfq/sellside" && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    const stateFilter = url.searchParams.get("state");
    let records = [...sellSideRfqStore.values()].sort((a, b) => b.createdAt - a.createdAt);
    if (userId) records = records.filter((r) => r.clientUserId === userId || r.salesUserId === userId);
    if (stateFilter) records = records.filter((r) => r.state === stateFilter);
    return new Response(JSON.stringify({ rfqs: records, total: records.length }), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  // Action routes: /rfq/sellside/:id/(route|markup|confirm|reject)
  const ssActionMatch = path.match(/^\/rfq\/sellside\/([^/]+)\/(route|markup|confirm|reject)$/);
  if (ssActionMatch && req.method === "PUT") {
    const rfq = sellSideRfqStore.get(ssActionMatch[1]);
    if (!rfq) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    const action = ssActionMatch[2];
    let actionBody: Record<string, unknown> = {};
    try {
      actionBody = await req.json();
    } catch { /* empty body ok for some actions */ }

    if (action === "route") {
      if (rfq.state !== "CLIENT_REQUEST") {
        return new Response(JSON.stringify({ error: `Cannot route from state ${rfq.state}` }), { status: 409, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      const salesUserId = actionBody.salesUserId as string | undefined;
      if (!salesUserId) {
        return new Response(JSON.stringify({ error: "Missing salesUserId" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      const basePrice = rfq.limitPrice ?? 0;
      const jitter = basePrice * (1 + (Math.random() - 0.5) * 0.01);
      rfq.salesUserId = salesUserId;
      rfq.dealerBestPrice = parseFloat(jitter.toFixed(4));
      rfq.state = "SALES_MARKUP";
      rfq.salesRoutedAt = Date.now();
      rfq.ts = Date.now();
      await publishSsRfqUpdate(rfq);
      return new Response(JSON.stringify(rfq), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    if (action === "markup") {
      if (rfq.state !== "SALES_MARKUP") {
        return new Response(JSON.stringify({ error: `Cannot apply markup from state ${rfq.state}` }), { status: 409, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      const salesUserId = actionBody.salesUserId as string | undefined;
      const markupBps = Number(actionBody.markupBps ?? 0);
      if (!salesUserId || salesUserId !== rfq.salesUserId) {
        return new Response(JSON.stringify({ error: "salesUserId does not match" }), { status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      const dealerPrice = rfq.dealerBestPrice ?? 0;
      const clientPrice = rfq.side === "BUY"
        ? dealerPrice * (1 + markupBps / 10000)
        : dealerPrice * (1 - markupBps / 10000);
      rfq.salesMarkupBps = markupBps;
      rfq.clientQuotedPrice = parseFloat(clientPrice.toFixed(4));
      rfq.state = "CLIENT_CONFIRMATION";
      rfq.salesMarkupAppliedAt = Date.now();
      rfq.ts = Date.now();
      await publishSsRfqUpdate(rfq);
      return new Response(JSON.stringify(rfq), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    if (action === "confirm") {
      if (rfq.state !== "CLIENT_CONFIRMATION") {
        return new Response(JSON.stringify({ error: `Cannot confirm from state ${rfq.state}` }), { status: 409, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      const clientUserId = actionBody.clientUserId as string | undefined;
      if (!clientUserId || clientUserId !== rfq.clientUserId) {
        return new Response(JSON.stringify({ error: "clientUserId does not match" }), { status: 403, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      rfq.state = "CONFIRMED";
      rfq.clientConfirmedAt = Date.now();
      rfq.ts = Date.now();
      await publishSsRfqUpdate(rfq);
      // Publish to orders.new so the order enters the main pipeline
      await producer?.send("orders.new", {
        orderId: `${rfq.rfqId}-ord`,
        clientOrderId: rfq.rfqId,
        userId: rfq.clientUserId,
        userRole: "external-client",
        asset: rfq.asset,
        side: rfq.side,
        quantity: rfq.quantity,
        limitPrice: rfq.clientQuotedPrice,
        strategy: "LIMIT",
        desk: "rfq",
        ts: Date.now(),
      }).catch(() => {});
      return new Response(JSON.stringify(rfq), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }

    if (action === "reject") {
      if (rfq.state === "CONFIRMED" || rfq.state === "REJECTED") {
        return new Response(JSON.stringify({ error: `Cannot reject from state ${rfq.state}` }), { status: 409, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
      }
      rfq.rejectedBy = actionBody.rejectedBy as string | undefined;
      rfq.rejectionReason = actionBody.reason as string | undefined;
      rfq.state = "REJECTED";
      rfq.ts = Date.now();
      await publishSsRfqUpdate(rfq);
      return new Response(JSON.stringify(rfq), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  // GET /rfq/sellside/:id — get one sell-side RFQ
  const ssIdMatch = path.match(/^\/rfq\/sellside\/([^/]+)$/);
  if (ssIdMatch && req.method === "GET") {
    const rfq = sellSideRfqStore.get(ssIdMatch[1]);
    if (!rfq) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    return new Response(JSON.stringify(rfq), { headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
