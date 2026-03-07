import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { applyExprGroup, applySort } from "../lib/gridQuery.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { GridQueryRequest, GridQueryResponse } from "../types/gridQuery.ts";

const PORT = Number(Deno.env.get("JOURNAL_PORT")) || 5_009;
const DB_PATH = Deno.env.get("JOURNAL_DB_PATH") || "./backend/data/journal.db";
const RETENTION_DAYS = Number(Deno.env.get("JOURNAL_RETENTION_DAYS")) || 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

// WAL mode for concurrent reads during high-frequency candle writes
db.query("PRAGMA journal_mode=WAL");
db.query("PRAGMA busy_timeout=10000");
db.query("PRAGMA synchronous=NORMAL");   // fsync only at WAL checkpoints, not every write
db.query("PRAGMA cache_size=-16000");    // 16 MB page cache (negative = kibibytes)

// Single DB connection — both reads and writes go through `db`.
// The batched write queue (below) keeps individual write transactions small
// enough that HTTP handler reads fit in between flush intervals.
const rdb = db; // alias for clarity in HTTP handlers

db.query(`CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  user_id TEXT,
  algo TEXT,
  instrument TEXT,
  side TEXT,
  order_id TEXT,
  child_id TEXT,
  quantity REAL,
  limit_price REAL,
  fill_price REAL,
  filled_qty REAL,
  market_price REAL,
  market_impact_bps REAL,
  algo_params TEXT,
  raw TEXT NOT NULL DEFAULT ''
);`);
// One-time migration: if raw column still has NOT NULL without a DEFAULT, add the default.
// This lets us write '' for high-volume rows instead of the full JSON blob.
// Safe to run repeatedly — ALTER TABLE ADD COLUMN fails silently if column exists.
try { db.query("ALTER TABLE journal ADD COLUMN _migration_sentinel INTEGER DEFAULT 1"); } catch { /* already migrated */ }
// Null out raw for high-volume rows that were stored with full JSON (saves disk on VACUUM)
try { db.query("UPDATE journal SET raw = '' WHERE event_type IN ('orders.child', 'orders.filled') AND LENGTH(raw) > 2;"); } catch { /* best-effort */ }

db.query(`CREATE INDEX IF NOT EXISTS idx_journal_ts ON journal(ts);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_journal_order_id ON journal(order_id);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_journal_instrument ON journal(instrument);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_journal_order_ts ON journal(ts, order_id) WHERE order_id IS NOT NULL;`);

// ── Candle store (market data history) ────────────────────────────────────────
// Aggregates market.ticks into OHLCV candles at 1m and 5m intervals.
// This replaces the standalone candle-store service, mirroring real TCA systems
// where market data history and trade journal share the same data tier.

db.query(`
  CREATE TABLE IF NOT EXISTS candles (
    instrument TEXT NOT NULL,
    interval   TEXT NOT NULL,
    time       INTEGER NOT NULL,
    open       REAL NOT NULL,
    high       REAL NOT NULL,
    low        REAL NOT NULL,
    close      REAL NOT NULL,
    volume     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (instrument, interval, time)
  );
`);
db.query(`CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(instrument, interval, time);`);

// (rdb is an alias for db — see declaration above)

const TICKS_PER_MINUTE = 240; // 4 ticks/s × 60 s
const MAX_CANDLES = 120;
const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

const stmtCandleUpsert = db.prepareQuery<
  [string, string, number, number, number, number, number, number],
  Record<string, unknown>,
  [string, string, number, number, number]
>(
  `INSERT INTO candles (instrument, interval, time, open, high, low, close, volume)
   VALUES (?1, ?2, ?3, ?4, ?4, ?4, ?4, ?5)
   ON CONFLICT(instrument, interval, time) DO UPDATE SET
     high   = MAX(high,   excluded.high),
     low    = MIN(low,    excluded.low),
     close  = excluded.close,
     volume = volume + excluded.volume`,
);

let lastPruneTs = 0;
function maybePruneCandles(now: number) {
  if (now - lastPruneTs < 60_000) return;
  lastPruneTs = now;
  // For each instrument+interval pair that exceeds MAX_CANDLES, delete the
  // oldest rows beyond the cap. We use a correlated subquery to find the
  // cut-off timestamp per instrument so only genuinely excess rows are removed.
  for (const { key } of INTERVALS) {
    db.query(
      `DELETE FROM candles
       WHERE interval = ?
         AND (instrument, time) IN (
           SELECT instrument, time FROM candles
           WHERE interval = ?
             AND time < (
               SELECT time FROM candles c2
               WHERE c2.instrument = candles.instrument
                 AND c2.interval   = ?
               ORDER BY time DESC
               LIMIT 1 OFFSET ?
             )
         )`,
      [key, key, key, MAX_CANDLES - 1],
    );
  }
}

function ingestTick(msg: { prices?: Record<string, number>; volumes?: Record<string, number> }) {
  if (!msg.prices) return;
  const ts = Date.now();
  const volumes = msg.volumes ?? {};

  db.query("BEGIN");
  try {
    for (const [instrument, price] of Object.entries(msg.prices)) {
      const tickVolume = (volumes[instrument] ?? 0) / TICKS_PER_MINUTE;
      for (const { key, ms } of INTERVALS) {
        const bucket = bucketStart(ts, ms);
        stmtCandleUpsert.execute([instrument, key, bucket, price, tickVolume]);
      }
    }
    db.query("COMMIT");
  } catch (err) {
    db.query("ROLLBACK");
    console.warn("[journal] candle upsert failed:", (err as Error).message);
  }

  maybePruneCandles(ts);
}

// ── Ingest order events from Redpanda ─────────────────────────────────────────

// Only trade lifecycle events belong in the journal — access logs go to observability only.
const CONSUME_TOPICS = [
  "orders.submitted",
  "orders.routed",
  "orders.child",
  "orders.filled",
  "orders.expired",
  "orders.rejected",
];

// deno-lint-ignore no-explicit-any
function extractFields(topic: string, value: any) {
  const baseId = value.childId ?? value.orderId ?? value.token ?? null;
  return {
    // Prefix with topic to prevent collisions between orders.submitted and
    // orders.routed (which share the same orderId but are different events).
    event_id: baseId ? `${topic}:${baseId}` : null,
    user_id: value.userId ?? null,
    algo: value.algo ?? null,
    instrument: value.asset ?? null,
    side: value.side ?? null,
    order_id: value.orderId ?? value.parentOrderId ?? null,
    child_id: value.childId ?? null,
    quantity: value.quantity ?? value.requestedQty ?? null,
    limit_price: value.limitPrice ?? null,
    fill_price: value.avgFillPrice ?? value.fillPrice ?? null,
    filled_qty: value.filledQty ?? null,
    market_price: value.marketPrice ?? null,
    market_impact_bps: value.marketImpactBps ?? null,
    algo_params: value.algoParams ? JSON.stringify(value.algoParams) : null,
  };
}

// ── Batched write queue ────────────────────────────────────────────────────────
// SQLite writes are synchronous and block the Deno event loop. To prevent HTTP
// requests from timing out when the Kafka consumer is catching up on a backlog,
// we buffer incoming events and flush them in a single transaction every 50ms.
// This keeps individual event-loop ticks short while maintaining write throughput.

type PendingRow = [
  string | null, string, number,
  string | null, string | null, string | null, string | null, string | null, string | null,
  number | null, number | null, number | null, number | null, number | null, number | null,
  string | null, string,
];

const writeQueue: PendingRow[] = [];
let pruneScheduled = false;

const FLUSH_BATCH_SIZE = 20; // max rows per transaction to keep event-loop ticks short

function flushWriteQueue() {
  if (writeQueue.length === 0) return;
  // Cap batch size so the transaction never blocks the event loop for too long
  const batch = writeQueue.splice(0, FLUSH_BATCH_SIZE);
  try {
    db.query("BEGIN");
    for (const row of batch) {
      db.query(
        `INSERT OR IGNORE INTO journal
          (event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
           quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        row,
      );
    }
    db.query("COMMIT");
    invalidateOrdersCache(); // new data written — next read gets fresh results
  } catch {
    try { db.query("ROLLBACK"); } catch { /* ignore */ }
  }

  // Prune once per flush (instead of per message)
  if (!pruneScheduled) {
    pruneScheduled = true;
    setTimeout(() => {
      pruneScheduled = false;
      try { db.query("DELETE FROM journal WHERE ts < ?;", [Date.now() - RETENTION_MS]); } catch { /* ignore */ }
    }, 5_000);
  }
}

// Flush every 50ms — keeps event loop free for HTTP handlers between flushes.
setInterval(flushWriteQueue, 50);

// deno-lint-ignore no-explicit-any
function ingest(topic: string, value: any) {
  const ts = value.ts ?? Date.now();
  const fields = extractFields(topic, value);
  // Skip storing raw JSON for high-volume event types — all needed fields are in columns.
  // This keeps the DB small (saves ~400-500 bytes per child/fill row).
  const raw = (topic === "orders.child" || topic === "orders.filled") ? "" : JSON.stringify(value);
  writeQueue.push([
    fields.event_id, topic, ts, fields.user_id, fields.algo, fields.instrument, fields.side,
    fields.order_id, fields.child_id, fields.quantity, fields.limit_price, fields.fill_price,
    fields.filled_qty, fields.market_price, fields.market_impact_bps, fields.algo_params,
    raw,
  ]);
}

// ── Reconcile missing fills from fix-archive on startup ───────────────────────
// If the journal missed orders.filled events (e.g. consumer wasn't ready when
// fills were published), fetch executions from fix-archive and write synthetic
// journal entries so reconstructOrders() returns correct filled/working status.

const FIX_ARCHIVE_URL = Deno.env.get("FIX_ARCHIVE_URL") || "http://localhost:5012";

async function reconcileFillsFromArchive(): Promise<void> {
  try {
    const res = await fetch(`${FIX_ARCHIVE_URL}/executions`);
    if (!res.ok) return;
    const executions = await res.json() as Array<{
      execId: string; clOrdId: string; origClOrdId: string; symbol: string;
      side: string; cumQty: number; avgPx: number; leavesQty: number;
      commission: number; ts: number;
    }>;

    let reconciled = 0;
    for (const ex of executions) {
      // origClOrdId is the OMS parent order ID (order_id in journal)
      const parentOrderId = ex.origClOrdId;
      // Check if we already have a filled event for this execution
      const existing = [...db.query(
        "SELECT id FROM journal WHERE event_type = 'orders.filled' AND child_id = ? LIMIT 1",
        [ex.clOrdId],
      )];
      if (existing.length > 0) continue;

      // Write a synthetic orders.filled entry
      const synthetic = {
        execId: ex.execId,
        childId: ex.clOrdId,
        parentOrderId,
        asset: ex.symbol,
        side: ex.side === "1" ? "BUY" : "SELL",
        filledQty: ex.cumQty,
        avgFillPrice: ex.avgPx,
        remainingQty: ex.leavesQty,
        commissionUSD: ex.commission,
        ts: ex.ts,
        _reconciled: true,
      };
      ingest("orders.filled", synthetic);
      reconciled++;
    }
    if (reconciled > 0) {
      console.log(`[journal] Reconciled ${reconciled} missing fill(s) from fix-archive`);
    }
  } catch (err) {
    console.warn("[journal] Fill reconciliation failed (fix-archive unavailable):", (err as Error).message);
  }
}

// Run reconciliation after a short delay to let fix-archive come up first
setTimeout(() => reconcileFillsFromArchive(), 5_000);

// ── Observability producer (best-effort, for grid.query timing events) ────────

const obsProducer = await createProducer("journal-obs").catch(() => null);

// If the DB is fresh (no journal rows), use a per-instance group ID so Kafka
// starts from the latest offset rather than replaying the full historical backlog.
// A full backlog replay blocks the Deno event loop (SQLite writes are synchronous)
// and prevents the HTTP server from responding. When the DB has existing data,
// use the stable "journal-group" to resume from the last committed offset.
const journalRowCount = [...db.query("SELECT COUNT(*) FROM journal;")][0][0] as number;
const journalGroupId = journalRowCount === 0
  ? `journal-fresh-${Date.now().toString(36)}`
  : "journal-group";
const marketGroupId = journalRowCount === 0
  ? `journal-market-fresh-${Date.now().toString(36)}`
  : "journal-market";
console.log(`[journal] Using consumer groups: ${journalGroupId}, ${marketGroupId} (${journalRowCount} existing rows)`);

createConsumer(journalGroupId, CONSUME_TOPICS).then((consumer) => {
  consumer.onMessage((topic, value) => {
    ingest(topic, value as Record<string, unknown>);
  });
  console.log(`[journal] Subscribed to: ${CONSUME_TOPICS.join(", ")}`);
});

// Subscribe to market ticks to build OHLCV candle history
createConsumer(marketGroupId, ["market.ticks"]).then((consumer) => {
  consumer.onMessage((_topic, value) => {
    ingestTick(value as { prices?: Record<string, number>; volumes?: Record<string, number> });
  });
  console.log("[journal] Subscribed to: market.ticks (candle aggregation)");
});

// ── HTTP handlers ──────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function rowToEntry(row: unknown[]) {
  const [id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
    quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw] = row;
  const rawStr = raw as string | null;
  // Reconstruct raw from columns when the blob was omitted (high-volume event types)
  const rawParsed = (rawStr && rawStr.length > 2)
    ? (() => { try { return JSON.parse(rawStr); } catch { return null; } })()
    : (event_type === "orders.child" ? {
        childId: child_id, parentOrderId: order_id, algo, asset: instrument, side,
        quantity, limitPrice: limit_price, marketPrice: market_price, ts,
      } : event_type === "orders.filled" ? {
        childId: child_id, parentOrderId: order_id, asset: instrument, side,
        filledQty: filled_qty, avgFillPrice: fill_price, marketImpactBps: market_impact_bps, ts,
      } : null);
  return {
    id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
    quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps,
    algo_params: algo_params ? (() => { try { return JSON.parse(algo_params as string); } catch { return null; } })() : null,
    raw: rawParsed,
  };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({ service: "journal", version: VERSION, status: "ok", retentionDays: RETENTION_DAYS });
  }

  // GET /candles?instrument=AAPL&interval=1m&limit=120
  if (req.method === "GET" && path === "/candles") {
    const instrument = url.searchParams.get("instrument");
    const interval = url.searchParams.get("interval") ?? "1m";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_CANDLES), MAX_CANDLES);

    if (!instrument) return json({ error: "instrument is required" }, 400);
    if (interval !== "1m" && interval !== "5m") return json({ error: "interval must be 1m or 5m" }, 400);

    const rows = [...rdb.query(
      `SELECT time, open, high, low, close, volume
       FROM candles
       WHERE instrument = ? AND interval = ?
       ORDER BY time DESC
       LIMIT ?`,
      [instrument, interval, limit],
    )].reverse(); // return ascending

    const candles = rows.map(([time, open, high, low, close, volume]) => ({
      time, open, high, low, close, volume,
    }));

    return json(candles);
  }

  // GET /journal?from=&to=&userId=&instrument=&orderId=&algo=&limit=&offset=
  if (req.method === "GET" && path === "/journal") {
    const from = Number(url.searchParams.get("from") ?? 0);
    const to = Number(url.searchParams.get("to") ?? Date.now());
    const userId = url.searchParams.get("userId");
    const instrument = url.searchParams.get("instrument");
    const orderId = url.searchParams.get("orderId");
    const algo = url.searchParams.get("algo");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 1000);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const conditions: string[] = ["ts >= ? AND ts <= ?"];
    const params: (string | number)[] = [from, to];

    if (userId) { conditions.push("user_id = ?"); params.push(userId); }
    if (instrument) { conditions.push("instrument = ?"); params.push(instrument); }
    if (orderId) { conditions.push("order_id = ?"); params.push(orderId); }
    if (algo) { conditions.push("algo = ?"); params.push(algo); }

    params.push(limit, offset);

    const rows = [...rdb.query(
      `SELECT id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
              quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw
       FROM journal
       WHERE ${conditions.join(" AND ")}
       ORDER BY ts DESC
       LIMIT ? OFFSET ?;`,
      params,
    )];

    const total = [...rdb.query(
      `SELECT COUNT(*) FROM journal WHERE ${conditions.slice(0, -0).join(" AND ")};`,
      params.slice(0, -2),
    )][0][0];

    return json({ total, limit, offset, entries: rows.map(rowToEntry) });
  }

  // GET /journal/order/:orderId — full lifecycle for one order
  const orderMatch = path.match(/^\/journal\/order\/([^/]+)$/);
  if (req.method === "GET" && orderMatch) {
    const orderId = orderMatch[1];
    const rows = [...rdb.query(
      `SELECT id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
              quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw
       FROM journal
       WHERE order_id = ?
       ORDER BY ts ASC;`,
      [orderId],
    )];
    return json({ orderId, entries: rows.map(rowToEntry) });
  }

  // GET /orders?limit=200 — reconstruct OrderRecord[] from journal events for UI hydration
  if (req.method === "GET" && path === "/orders") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const allOrders = reconstructOrders(RETENTION_MS);
    return json(allOrders.slice(0, limit));
  }

  // POST /grid/query — server-side filter + sort + paginate
  if (req.method === "POST" && path === "/grid/query") {
    let body: GridQueryRequest;
    try {
      body = await req.json() as GridQueryRequest;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { gridId, filterExpr, sortField, sortDir, offset = 0, limit = 200 } = body;
    if (!gridId || !filterExpr) {
      return json({ error: "gridId and filterExpr are required" }, 400);
    }
    const safeLimit = Math.min(Number(limit) || 200, 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    // Build dataset from journal
    const allOrders = reconstructOrders();
    const dataset: Record<string, unknown>[] =
      gridId === "executions"
        ? allOrders.flatMap((o) =>
            (o.children as Record<string, unknown>[]).map((c) => ({
              ...c,
              parentId: o.id,
              asset: o.asset,
              strategy: o.strategy,
              userId: o.userId,
            }))
          )
        : allOrders;

    const t0 = performance.now();
    const filtered = applyExprGroup(dataset, filterExpr);
    const sorted = applySort(filtered, sortField ?? null, sortDir ?? null);
    const total = sorted.length;
    const rows = sorted.slice(safeOffset, safeOffset + safeLimit);
    const evalMs = Number((performance.now() - t0).toFixed(3));

    // Emit timing event to observability bus (best-effort)
    obsProducer?.send("grid.query", {
      gridId,
      total,
      evalMs,
      userId: req.headers.get("x-user-id") ?? null,
      ts: Date.now(),
    }).catch(() => {});

    const response: GridQueryResponse = { rows, total, evalMs };
    return json(response);
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

// ── Shared dataset reconstruction ─────────────────────────────────────────────

/**
 * Reconstruct all OrderRecord objects from journal events within the given
 * lookback window. Defaults to 24h for grid queries (fast path); pass
 * RETENTION_MS for the full history endpoint. Returns orders sorted newest-first.
 */
const GRID_LOOKBACK_MS = 24 * 60 * 60 * 1_000; // 24h default for grid queries

// Short-lived cache so rapid successive grid queries (e.g., UI polling every 500ms)
// don't each trigger a full table scan. Invalidated after CACHE_TTL_MS or when a
// new write is flushed (via writeQueue flush signal).
const CACHE_TTL_MS = 300; // 300ms — short enough to see new orders within one poll cycle
let _ordersCache: { ts: number; lookbackMs: number; rows: Record<string, unknown>[] } | null = null;

function invalidateOrdersCache() { _ordersCache = null; }

function reconstructOrders(lookbackMs = GRID_LOOKBACK_MS): Record<string, unknown>[] {
  const now = Date.now();
  if (_ordersCache && _ordersCache.lookbackMs === lookbackMs && now - _ordersCache.ts < CACHE_TTL_MS) {
    return _ordersCache.rows;
  }
  const rows = _reconstructOrders(lookbackMs);
  _ordersCache = { ts: now, lookbackMs, rows };
  return rows;
}

function _reconstructOrders(lookbackMs: number): Record<string, unknown>[] {
  const since = Date.now() - lookbackMs;

  // ── Pass 1: order structure rows (low-volume, need raw for clientOrderId/algoParams) ──
  // Only submitted and pre-routed-rejected need the raw blob; routed/expired/rejected-post
  // are also included here but are tiny in count.
  const structureRows = [...rdb.query(
    `SELECT order_id, event_type, ts,
            instrument, side, quantity, limit_price,
            algo, user_id, algo_params, raw
     FROM journal
     WHERE order_id IS NOT NULL AND ts >= ?
       AND event_type IN ('orders.submitted','orders.routed','orders.expired','orders.rejected')
     ORDER BY ts ASC;`,
    [since],
  )] as [
    string, string, number,
    string | null, string | null, number | null, number | null,
    string | null, string | null, string | null, string,
  ][];

  const orderMap = new Map<string, Record<string, unknown>>();
  for (const [
    orderId, eventType, ts,
    instrument, side, quantity, limitPrice,
    algo, userId, algoParamsStr, rawStr,
  ] of structureRows) {
    if (eventType === "orders.submitted" || (eventType === "orders.rejected" && !orderMap.has(orderId))) {
      let raw: Record<string, unknown> = {};
      try { raw = JSON.parse(rawStr); } catch { /* skip */ }
      let algoParams: unknown = null;
      try { algoParams = algoParamsStr ? JSON.parse(algoParamsStr) : null; } catch { /* skip */ }

      orderMap.set(orderId, {
        id: (raw.clientOrderId as string | undefined) ?? orderId,
        submittedAt: ts,
        asset: instrument ?? raw.asset ?? "",
        side: side ?? raw.side ?? "BUY",
        quantity: quantity ?? raw.quantity ?? raw.requestedQty ?? 0,
        limitPrice: limitPrice ?? raw.limitPrice ?? 0,
        expiresAt: eventType === "orders.submitted" ? (raw.expiresAt ?? ts + 86_400_000) : ts + 86_400_000,
        strategy: algo ?? raw.strategy ?? "LIMIT",
        status: eventType === "orders.rejected" ? "rejected" : "pending",
        rejectReason: eventType === "orders.rejected" ? (raw.reason ?? raw.message ?? null) : undefined,
        filled: 0,
        algoParams: algoParams ?? { strategy: algo ?? raw.strategy ?? "LIMIT" },
        userId: userId ?? raw.userId ?? null,
        children: [],
      });
    } else if (orderMap.has(orderId)) {
      const order = orderMap.get(orderId)!;
      if (eventType === "orders.routed") {
        if (order.status === "pending") order.status = "working";
      } else if (eventType === "orders.expired") {
        order.status = "expired";
      } else if (eventType === "orders.rejected") {
        order.status = "rejected";
        try {
          const raw = JSON.parse(rawStr) as Record<string, unknown>;
          if (raw.reason) order.rejectReason = raw.reason;
        } catch { /* skip */ }
      }
    }
  }

  // ── Pass 2: high-volume child/fill rows — columns only, no raw JSON parsing ──
  const activityRows = [...rdb.query(
    `SELECT order_id, event_type, ts,
            side, quantity, limit_price, filled_qty, child_id
     FROM journal
     WHERE order_id IS NOT NULL AND ts >= ?
       AND event_type IN ('orders.child','orders.filled')
     ORDER BY ts ASC;`,
    [since],
  )] as [string, string, number, string | null, number | null, number | null, number | null, string | null][];

  for (const [orderId, eventType, ts, side, quantity, limitPrice, filledQty, childId] of activityRows) {
    const order = orderMap.get(orderId);
    if (!order) continue;

    if (eventType === "orders.filled") {
      order.filled = Number(order.filled ?? 0) + Number(filledQty ?? 0);
      const qty = Number(order.quantity ?? 0);
      order.status = qty > 0 && Number(order.filled) >= qty ? "filled" : "working";
    } else if (eventType === "orders.child") {
      (order.children as unknown[]).push({
        id: childId ?? "",
        side: side ?? order.side,
        quantity: quantity ?? 0,
        limitPrice: limitPrice ?? 0,
        filledQty: 0,
        avgFillPrice: 0,
        commissionUSD: 0,
        submittedAt: ts,
        status: "pending",
      });
      if (order.status === "pending") order.status = "working";
    }
  }

  return [...orderMap.values()].sort(
    (a, b) => Number(b.submittedAt) - Number(a.submittedAt),
  );
}

Deno.serve({ port: PORT }, handle);
