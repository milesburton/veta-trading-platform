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

  // GET /rfq/stats
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

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});
