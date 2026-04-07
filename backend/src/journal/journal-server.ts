import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { applyExprGroup, applySort } from "../lib/gridQuery.ts";
import { journalPool } from "../lib/db.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type {
  GridQueryRequest,
  GridQueryResponse,
} from "../types/gridQuery.ts";

const PORT = Number(Deno.env.get("JOURNAL_PORT")) || 5_009;
const RETENTION_DAYS = Number(Deno.env.get("JOURNAL_RETENTION_DAYS")) || 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TICKS_PER_MINUTE = 240;
const MAX_CANDLES = 120;
const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

let lastPruneTs = 0;
async function maybePruneCandles(now: number) {
  if (now - lastPruneTs < 60_000) return;
  lastPruneTs = now;
  const client = await journalPool.connect();
  try {
    for (const { key } of INTERVALS) {
      await client.queryArray(
        `DELETE FROM journal.candles
         WHERE (interval, instrument, time) IN (
           SELECT interval, instrument, time FROM (
             SELECT interval, instrument, time,
                    ROW_NUMBER() OVER (PARTITION BY instrument ORDER BY time DESC) AS rn
             FROM journal.candles WHERE interval = $1
           ) ranked WHERE rn > $2
         )`,
        [key, MAX_CANDLES],
      );
    }
  } finally {
    client.release();
  }
}

async function ingestTick(
  msg: { prices?: Record<string, number>; volumes?: Record<string, number> },
) {
  if (!msg.prices) return;
  const ts = Date.now();
  const volumes = msg.volumes ?? {};
  const entries = Object.entries(msg.prices);
  if (entries.length === 0) return;

  const instruments = entries.map(([sym]) => sym);
  const prices = entries.map(([, p]) => p);
  const vols = entries.map(([sym]) => (volumes[sym] ?? 0) / TICKS_PER_MINUTE);

  const client = await journalPool.connect();
  try {
    await client.queryArray("BEGIN");
    for (const { key, ms } of INTERVALS) {
      const bucket = new Date(bucketStart(ts, ms));
      await client.queryArray(
        `INSERT INTO journal.candles (instrument, interval, time, open, high, low, close, volume)
         SELECT unnest($1::text[]), $2, $3,
                unnest($4::numeric[]), unnest($4::numeric[]),
                unnest($4::numeric[]), unnest($4::numeric[]),
                unnest($5::numeric[])
         ON CONFLICT (instrument, interval, time) DO UPDATE SET
           high   = GREATEST(journal.candles.high,  EXCLUDED.high),
           low    = LEAST(journal.candles.low,    EXCLUDED.low),
           close  = EXCLUDED.close,
           volume = journal.candles.volume + EXCLUDED.volume`,
        [instruments, key, bucket, prices, vols],
      );
    }
    await client.queryArray("COMMIT");
  } catch (err) {
    await client.queryArray("ROLLBACK").catch(() => {});
    console.warn("[journal] candle upsert failed:", (err as Error).message);
  } finally {
    client.release();
  }
  maybePruneCandles(ts).catch(() => {});
}

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
    algo_params: value.algoParams ?? null,
  };
}

type PendingRow = [
  string | null,
  string,
  Date,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  unknown,
  unknown,
];

const writeQueue: PendingRow[] = [];
let pruneScheduled = false;
let flushing = false;
const FLUSH_BATCH_SIZE = 20;

function invalidateOrdersCache() {
  _ordersCache = null;
}

async function flushWriteQueue() {
  if (flushing || writeQueue.length === 0) return;
  flushing = true;
  const batch = writeQueue.splice(0, FLUSH_BATCH_SIZE);
  const client = await journalPool.connect();
  try {
    await client.queryArray("BEGIN");
    for (const row of batch) {
      await client.queryArray(
        `INSERT INTO journal.events
           (event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
            quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps,
            algo_params, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (event_id) DO NOTHING`,
        row,
      );
    }
    await client.queryArray("COMMIT");
    invalidateOrdersCache();
  } catch {
    await client.queryArray("ROLLBACK").catch(() => {});
  } finally {
    client.release();
    flushing = false;
  }

  if (!pruneScheduled) {
    pruneScheduled = true;
    setTimeout(async () => {
      pruneScheduled = false;
      const c = await journalPool.connect();
      try {
        await c.queryArray(
          "DELETE FROM journal.events WHERE ts < now() - ($1 || ' milliseconds')::interval",
          [RETENTION_MS],
        );
      } catch {
        /* ignore */
      } finally {
        c.release();
      }
    }, 5_000);
  }
}

setInterval(() => {
  flushWriteQueue().catch(() => {});
}, 50);

async function pruneOldEvents(): Promise<void> {
  const c = await journalPool.connect();
  try {
    const result = await c.queryArray(
      "DELETE FROM journal.events WHERE ts < now() - ($1 || ' milliseconds')::interval",
      [RETENTION_MS],
    );
    await c.queryArray("VACUUM journal.events").catch(() => {});
    console.log(
      `[journal] Prune: removed ${
        result.rowCount ?? 0
      } events older than ${RETENTION_DAYS}d`,
    );
  } catch (err) {
    console.warn("[journal] Prune failed:", (err as Error).message);
  } finally {
    c.release();
  }
}

const PRUNE_INTERVAL_MS = Number(Deno.env.get("JOURNAL_PRUNE_INTERVAL_MS")) || 60 * 60 * 1_000;
setTimeout(() => pruneOldEvents().catch(() => {}), 30_000);
setInterval(() => pruneOldEvents().catch(() => {}), PRUNE_INTERVAL_MS);

// deno-lint-ignore no-explicit-any
function ingest(topic: string, value: any) {
  const ts = new Date(value.ts ?? Date.now());
  const fields = extractFields(topic, value);
  const raw = (topic === "orders.child" || topic === "orders.filled")
    ? null
    : value;
  writeQueue.push([
    fields.event_id,
    topic,
    ts,
    fields.user_id,
    fields.algo,
    fields.instrument,
    fields.side,
    fields.order_id,
    fields.child_id,
    fields.quantity,
    fields.limit_price,
    fields.fill_price,
    fields.filled_qty,
    fields.market_price,
    fields.market_impact_bps,
    fields.algo_params,
    raw,
  ]);
}

const FIX_ARCHIVE_URL = Deno.env.get("FIX_ARCHIVE_URL") ||
  "http://localhost:5012";

async function reconcileFillsFromArchive(): Promise<void> {
  try {
    const res = await fetch(`${FIX_ARCHIVE_URL}/executions`);
    if (!res.ok) return;
    const executions = await res.json() as Array<{
      execId: string;
      clOrdId: string;
      origClOrdId: string;
      symbol: string;
      side: string;
      cumQty: number;
      avgPx: number;
      leavesQty: number;
      commission: number;
      ts: number;
    }>;

    const incomingIds = executions.map((ex) => ex.clOrdId);
    const client = await journalPool.connect();
    let reconciled = 0;
    try {
      const { rows } = await client.queryArray(
        `SELECT DISTINCT child_id FROM journal.events
         WHERE event_type = 'orders.filled' AND child_id = ANY($1)`,
        [incomingIds],
      );
      const alreadyFilled = new Set(rows.map((r) => r[0] as string));
      for (const ex of executions) {
        if (alreadyFilled.has(ex.clOrdId)) continue;
        ingest("orders.filled", {
          execId: ex.execId,
          childId: ex.clOrdId,
          parentOrderId: ex.origClOrdId,
          asset: ex.symbol,
          side: ex.side === "1" ? "BUY" : "SELL",
          filledQty: ex.cumQty,
          avgFillPrice: ex.avgPx,
          remainingQty: ex.leavesQty,
          commissionUSD: ex.commission,
          ts: ex.ts,
          _reconciled: true,
        });
        reconciled++;
      }
    } finally {
      client.release();
    }

    if (reconciled > 0) {
      console.log(
        `[journal] Reconciled ${reconciled} missing fill(s) from fix-archive`,
      );
    }
  } catch (err) {
    console.warn(
      "[journal] Fill reconciliation failed:",
      (err as Error).message,
    );
  }
}

setTimeout(() => reconcileFillsFromArchive(), 5_000);

const obsProducer = await createProducer("journal-obs").catch(() => null);

// Per-instance consumer group IDs — avoids Kafka backlog replay on fresh DB
let journalRowCount = 0;
{
  const client = await journalPool.connect().catch(() => null);
  if (client) {
    try {
      const { rows } = await client.queryArray(
        "SELECT COUNT(*) FROM journal.events",
      );
      journalRowCount = Number(rows[0]?.[0] ?? 0);
    } catch {
      /* fresh DB */
    } finally {
      client.release();
    }
  }
}
const journalGroupId = journalRowCount === 0
  ? `journal-fresh-${Date.now().toString(36)}`
  : "journal-group";
const marketGroupId = journalRowCount === 0
  ? `journal-market-fresh-${Date.now().toString(36)}`
  : "journal-market";
console.log(
  `[journal] Consumer groups: ${journalGroupId}, ${marketGroupId} (${journalRowCount} rows)`,
);

createConsumer(journalGroupId, CONSUME_TOPICS).then((consumer) => {
  consumer.onMessage((topic, value) =>
    ingest(topic, value as Record<string, unknown>)
  );
  console.log(`[journal] Subscribed to: ${CONSUME_TOPICS.join(", ")}`);
});

createConsumer(marketGroupId, ["market.ticks"]).then((consumer) => {
  consumer.onMessage((_topic, value) =>
    ingestTick(
      value as {
        prices?: Record<string, number>;
        volumes?: Record<string, number>;
      },
    )
  );
  console.log("[journal] Subscribed to: market.ticks");
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function rowToEntry(row: unknown[]) {
  const [
    id,
    event_id,
    event_type,
    ts,
    user_id,
    algo,
    instrument,
    side,
    order_id,
    child_id,
    quantity,
    limit_price,
    fill_price,
    filled_qty,
    market_price,
    market_impact_bps,
    algo_params,
    raw,
  ] = row;
  const rawParsed = raw !== null ? raw : event_type === "orders.child"
    ? {
      childId: child_id,
      parentOrderId: order_id,
      algo,
      asset: instrument,
      side,
      quantity,
      limitPrice: limit_price,
      marketPrice: market_price,
      ts,
    }
    : event_type === "orders.filled"
    ? {
      childId: child_id,
      parentOrderId: order_id,
      asset: instrument,
      side,
      filledQty: filled_qty,
      avgFillPrice: fill_price,
      marketImpactBps: market_impact_bps,
      ts,
    }
    : null;
  return {
    id,
    event_id,
    event_type,
    ts: ts instanceof Date ? ts.getTime() : ts,
    user_id,
    algo,
    instrument,
    side,
    order_id,
    child_id,
    quantity,
    limit_price,
    fill_price,
    filled_qty,
    market_price,
    market_impact_bps,
    algo_params,
    raw: rawParsed,
  };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({
      service: "journal",
      version: VERSION,
      status: "ok",
      retentionDays: RETENTION_DAYS,
    });
  }

  if (req.method === "GET" && path === "/candles") {
    const instrument = url.searchParams.get("instrument");
    const interval = url.searchParams.get("interval") ?? "1m";
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? MAX_CANDLES),
      MAX_CANDLES,
    );
    if (!instrument) return json({ error: "instrument is required" }, 400);
    if (interval !== "1m" && interval !== "5m") {
      return json({ error: "interval must be 1m or 5m" }, 400);
    }

    const client = await journalPool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT time, open, high, low, close, volume
         FROM journal.candles
         WHERE instrument = $1 AND interval = $2
         ORDER BY time DESC LIMIT $3`,
        [instrument, interval, limit],
      );
      const candles = rows.reverse().map((
        [time, open, high, low, close, volume],
      ) => ({
        time: time instanceof Date ? time.getTime() : time,
        open,
        high,
        low,
        close,
        volume,
      }));
      return json(candles);
    } finally {
      client.release();
    }
  }

  if (req.method === "GET" && path === "/journal") {
    const from = new Date(Number(url.searchParams.get("from") ?? 0));
    const to = new Date(Number(url.searchParams.get("to") ?? Date.now()));
    const userId = url.searchParams.get("userId");
    const instrument = url.searchParams.get("instrument");
    const orderId = url.searchParams.get("orderId");
    const algo = url.searchParams.get("algo");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 1000);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const conditions = ["ts >= $1 AND ts <= $2"];
    const params: unknown[] = [from, to];
    let p = 3;
    if (userId) {
      conditions.push(`user_id = $${p++}`);
      params.push(userId);
    }
    if (instrument) {
      conditions.push(`instrument = $${p++}`);
      params.push(instrument);
    }
    if (orderId) {
      conditions.push(`order_id = $${p++}`);
      params.push(orderId);
    }
    if (algo) {
      conditions.push(`algo = $${p++}`);
      params.push(algo);
    }

    const where = conditions.join(" AND ");
    const client = await journalPool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
                quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw
         FROM journal.events WHERE ${where} ORDER BY ts DESC LIMIT $${p} OFFSET $${
          p + 1
        }`,
        [...params, limit, offset],
      );
      const { rows: countRows } = await client.queryArray(
        `SELECT COUNT(*) FROM journal.events WHERE ${where}`,
        params,
      );
      return json({
        total: Number(countRows[0][0]),
        limit,
        offset,
        entries: rows.map(rowToEntry),
      });
    } finally {
      client.release();
    }
  }

  const orderMatch = path.match(/^\/journal\/order\/([^/]+)$/);
  if (req.method === "GET" && orderMatch) {
    const client = await journalPool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
                quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw
         FROM journal.events WHERE order_id = $1 ORDER BY ts ASC`,
        [orderMatch[1]],
      );
      return json({ orderId: orderMatch[1], entries: rows.map(rowToEntry) });
    } finally {
      client.release();
    }
  }

  if (req.method === "GET" && path === "/orders") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const allOrders = await reconstructOrders(RETENTION_MS);
    return json(allOrders.slice(0, limit));
  }

  if (req.method === "POST" && path === "/grid/query") {
    let body: GridQueryRequest;
    try {
      body = await req.json() as GridQueryRequest;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { gridId, filterExpr, sortField, sortDir, offset = 0, limit = 200 } =
      body;
    if (!gridId || !filterExpr) {
      return json({ error: "gridId and filterExpr are required" }, 400);
    }

    const safeLimit = Math.min(Number(limit) || 200, 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const allOrders = await reconstructOrders();
    const dataset: Record<string, unknown>[] = gridId === "executions"
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

const GRID_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const CACHE_TTL_MS = 300;
let _ordersCache: {
  ts: number;
  lookbackMs: number;
  rows: Record<string, unknown>[];
} | null = null;

async function reconstructOrders(
  lookbackMs = GRID_LOOKBACK_MS,
): Promise<Record<string, unknown>[]> {
  const now = Date.now();
  if (
    _ordersCache && _ordersCache.lookbackMs === lookbackMs &&
    now - _ordersCache.ts < CACHE_TTL_MS
  ) {
    return _ordersCache.rows;
  }
  const rows = await _reconstructOrders(lookbackMs);
  _ordersCache = { ts: now, lookbackMs, rows };
  return rows;
}

async function _reconstructOrders(
  lookbackMs: number,
): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - lookbackMs);
  const client = await journalPool.connect();
  try {
    const { rows: structureRows } = await client.queryArray(
      `SELECT order_id, event_type, ts, instrument, side, quantity, limit_price,
              algo, user_id, algo_params, raw
       FROM journal.events
       WHERE order_id IS NOT NULL AND ts >= $1
         AND event_type IN ('orders.submitted','orders.routed','orders.expired','orders.rejected')
       ORDER BY ts ASC`,
      [since],
    );

    const orderMap = new Map<string, Record<string, unknown>>();
    for (
      const [
        orderId,
        eventType,
        ts,
        instrument,
        side,
        quantity,
        limitPrice,
        algo,
        userId,
        algoParams,
        raw,
      ] of structureRows as unknown[][]
    ) {
      const tsMs = ts instanceof Date ? ts.getTime() : Number(ts);
      if (
        eventType === "orders.submitted" ||
        (eventType === "orders.rejected" && !orderMap.has(orderId as string))
      ) {
        const rawObj = (raw ?? {}) as Record<string, unknown>;
        orderMap.set(orderId as string, {
          id: (rawObj.clientOrderId as string | undefined) ?? orderId,
          submittedAt: tsMs,
          asset: instrument ?? rawObj.asset ?? "",
          side: side ?? rawObj.side ?? "BUY",
          quantity: quantity ?? rawObj.quantity ?? rawObj.requestedQty ?? 0,
          limitPrice: limitPrice ?? rawObj.limitPrice ?? 0,
          expiresAt: eventType === "orders.submitted"
            ? (rawObj.expiresAt ?? tsMs + 86_400_000)
            : tsMs + 86_400_000,
          strategy: algo ?? rawObj.strategy ?? "LIMIT",
          status: eventType === "orders.rejected" ? "rejected" : "pending",
          rejectReason: eventType === "orders.rejected"
            ? (rawObj.reason ?? rawObj.message ?? null)
            : undefined,
          filled: 0,
          algoParams: algoParams ??
            { strategy: algo ?? rawObj.strategy ?? "LIMIT" },
          userId: userId ?? rawObj.userId ?? null,
          children: [],
        });
      } else if (orderMap.has(orderId as string)) {
        const order = orderMap.get(orderId as string)!;
        if (eventType === "orders.routed") {
          if (order.status === "pending") order.status = "working";
        } else if (eventType === "orders.expired") {
          order.status = "expired";
        } else if (eventType === "orders.rejected") {
          order.status = "rejected";
          const rawObj = (raw ?? {}) as Record<string, unknown>;
          if (rawObj.reason) order.rejectReason = rawObj.reason;
        }
      }
    }

    const { rows: activityRows } = await client.queryArray(
      `SELECT order_id, event_type, ts, side, quantity, limit_price, filled_qty, child_id
       FROM journal.events
       WHERE order_id IS NOT NULL AND ts >= $1
         AND event_type IN ('orders.child','orders.filled')
       ORDER BY ts ASC`,
      [since],
    );

    for (
      const [
        orderId,
        eventType,
        ,
        side,
        quantity,
        limitPrice,
        filledQty,
        childId,
      ] of activityRows as unknown[][]
    ) {
      const order = orderMap.get(orderId as string);
      if (!order) continue;
      if (eventType === "orders.filled") {
        order.filled = Number(order.filled ?? 0) + Number(filledQty ?? 0);
        const qty = Number(order.quantity ?? 0);
        order.status = qty > 0 && Number(order.filled) >= qty
          ? "filled"
          : "working";
      } else if (eventType === "orders.child") {
        (order.children as unknown[]).push({
          id: childId ?? "",
          side: side ?? order.side,
          quantity: quantity ?? 0,
          limitPrice: limitPrice ?? 0,
          filledQty: 0,
          avgFillPrice: 0,
          commissionUSD: 0,
          status: "pending",
        });
        if (order.status === "pending") order.status = "working";
      }
    }

    return [...orderMap.values()].sort((a, b) =>
      Number(b.submittedAt) - Number(a.submittedAt)
    );
  } finally {
    client.release();
  }
}

Deno.serve({ port: PORT }, handle);
