/**
 * FIX Archive (Drop-Copy Service)
 *
 * Subscribes to "fix.execution" from the message bus and persists every
 * execution report to SQLite. This provides a compliance-grade audit trail
 * of all fills — equivalent to a FIX drop-copy in a production system.
 *
 * HTTP:
 *   GET /health
 *   GET /executions?symbol=AAPL&limit=500&from=<ms>&to=<ms>
 *   GET /executions/:execId
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("FIX_ARCHIVE_PORT")) || 5_012;
const DB_PATH = Deno.env.get("FIX_ARCHIVE_DB_PATH") || "./backend/data/fix-archive.db";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

db.query("PRAGMA journal_mode=WAL");
db.query("PRAGMA synchronous=NORMAL");
db.query("PRAGMA cache_size=-8000");
db.query("PRAGMA busy_timeout=5000");

db.query(`
  CREATE TABLE IF NOT EXISTS executions (
    exec_id        TEXT PRIMARY KEY,
    cl_ord_id      TEXT NOT NULL,
    orig_cl_ord_id TEXT,
    symbol         TEXT NOT NULL,
    side           TEXT NOT NULL,
    exec_type      TEXT NOT NULL,
    ord_status     TEXT NOT NULL,
    leaves_qty     REAL NOT NULL DEFAULT 0,
    cum_qty        REAL NOT NULL DEFAULT 0,
    avg_px         REAL NOT NULL DEFAULT 0,
    last_qty       REAL NOT NULL DEFAULT 0,
    last_px        REAL NOT NULL DEFAULT 0,
    venue          TEXT,
    counterparty   TEXT,
    commission     REAL,
    settl_date     TEXT,
    transact_time  TEXT NOT NULL,
    ts             INTEGER NOT NULL
  );
`);

db.query(`CREATE INDEX IF NOT EXISTS idx_exec_symbol ON executions(symbol, ts);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_exec_cl_ord_id ON executions(cl_ord_id);`);

// One-time migration: drop raw_payload column if it exists (saves ~19MB on existing DBs).
// SQLite >= 3.35 supports DROP COLUMN; older versions need a table rebuild.
// We use a sentinel to avoid repeating this on every startup.
const hasSentinel = [...db.query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_fix_archive_v2'")][0][0] as number;
if (!hasSentinel) {
  try {
    // Check if raw_payload column still exists
    const cols = [...db.query("PRAGMA table_info(executions)")].map((r) => r[1] as string);
    if (cols.includes("raw_payload")) {
      // Rebuild table without raw_payload
      db.query("BEGIN");
      db.query(`CREATE TABLE executions_new (
        exec_id TEXT PRIMARY KEY, cl_ord_id TEXT NOT NULL, orig_cl_ord_id TEXT,
        symbol TEXT NOT NULL, side TEXT NOT NULL, exec_type TEXT NOT NULL, ord_status TEXT NOT NULL,
        leaves_qty REAL NOT NULL DEFAULT 0, cum_qty REAL NOT NULL DEFAULT 0,
        avg_px REAL NOT NULL DEFAULT 0, last_qty REAL NOT NULL DEFAULT 0, last_px REAL NOT NULL DEFAULT 0,
        venue TEXT, counterparty TEXT, commission REAL, settl_date TEXT,
        transact_time TEXT NOT NULL, ts INTEGER NOT NULL
      )`);
      db.query(`INSERT INTO executions_new SELECT
        exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
        leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
        commission, settl_date, transact_time, ts
        FROM executions`);
      db.query("DROP TABLE executions");
      db.query("ALTER TABLE executions_new RENAME TO executions");
      db.query("CREATE INDEX idx_exec_symbol ON executions(symbol, ts)");
      db.query("CREATE INDEX idx_exec_cl_ord_id ON executions(cl_ord_id)");
      db.query("COMMIT");
      console.log("[fix-archive] Migrated: dropped raw_payload column");
    }
  } catch (err) {
    try { db.query("ROLLBACK"); } catch { /* ignore */ }
    console.warn("[fix-archive] Migration failed (non-fatal):", (err as Error).message);
  }
  db.query("CREATE TABLE IF NOT EXISTS _fix_archive_v2 (done INTEGER)");
}

// ── Batched write queue ────────────────────────────────────────────────────────

type PendingExec = [string, string, string | null, string, string, string, string,
  number, number, number, number, number,
  string | null, string | null, number | null, string | null, string, number];

const writeQueue: PendingExec[] = [];

function flushWriteQueue() {
  if (writeQueue.length === 0) return;
  const batch = writeQueue.splice(0, 50);
  try {
    db.query("BEGIN");
    for (const row of batch) {
      db.query(
        `INSERT OR REPLACE INTO executions
          (exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
           leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
           commission, settl_date, transact_time, ts)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        row,
      );
    }
    db.query("COMMIT");
  } catch {
    try { db.query("ROLLBACK"); } catch { /* ignore */ }
  }
}

setInterval(flushWriteQueue, 50);

// ── Consumer ──────────────────────────────────────────────────────────────────

interface ExecReport {
  execId: string;
  clOrdId: string;
  origClOrdId?: string;
  symbol: string;
  side: string;
  execType: string;
  ordStatus: string;
  leavesQty: number;
  cumQty: number;
  avgPx: number;
  lastQty: number;
  lastPx: number;
  venue?: string;
  counterparty?: string;
  commission?: number;
  settlDate?: string;
  transactTime: string;
  ts: number;
}

async function startConsumer(): Promise<void> {
  const consumer = await createConsumer("fix-archive", ["fix.execution"]).catch((err) => {
    console.warn("[fix-archive] Cannot subscribe to fix.execution:", err.message);
    return null;
  });
  if (!consumer) return;

  consumer.onMessage((_topic, raw) => {
    const r = raw as ExecReport;
    writeQueue.push([
      r.execId, r.clOrdId, r.origClOrdId ?? null, r.symbol, r.side,
      r.execType, r.ordStatus, r.leavesQty, r.cumQty, r.avgPx,
      r.lastQty, r.lastPx, r.venue ?? null, r.counterparty ?? null,
      r.commission ?? null, r.settlDate ?? null, r.transactTime, r.ts,
    ]);
  });
}

await startConsumer();

// ── HTTP API ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const EXEC_COLS = `exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
  leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
  commission, settl_date, transact_time, ts`;

function rowToExec(r: unknown[]) {
  const [execId, clOrdId, origClOrdId, symbol, side, execType, ordStatus,
    leavesQty, cumQty, avgPx, lastQty, lastPx, venue, counterparty,
    commission, settlDate, transactTime, ts] = r;
  return { execId, clOrdId, origClOrdId, symbol, side, execType, ordStatus,
    leavesQty, cumQty, avgPx, lastQty, lastPx, venue, counterparty,
    commission, settlDate, transactTime, ts };
}

Deno.serve({ port: PORT }, (req: Request): Response => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === "/health" && req.method === "GET") {
    const count = [...db.query("SELECT COUNT(*) FROM executions")][0][0] as number;
    return json({ service: "fix-archive", version: VERSION, status: "ok", executions: count });
  }

  if (path === "/executions" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);
    const from = url.searchParams.get("from") ? Number(url.searchParams.get("from")) : 0;
    const to = url.searchParams.get("to") ? Number(url.searchParams.get("to")) : Date.now() + 1;

    const rows = symbol
      ? [...db.query(`SELECT ${EXEC_COLS} FROM executions WHERE symbol=? AND ts>=? AND ts<? ORDER BY ts DESC LIMIT ?`, [symbol, from, to, limit])]
      : [...db.query(`SELECT ${EXEC_COLS} FROM executions WHERE ts>=? AND ts<? ORDER BY ts DESC LIMIT ?`, [from, to, limit])];

    return json(rows.map(rowToExec));
  }

  const match = path.match(/^\/executions\/(.+)$/);
  if (match && req.method === "GET") {
    const rows = [...db.query(`SELECT ${EXEC_COLS} FROM executions WHERE exec_id=?`, [match[1]])];
    if (rows.length === 0) return json({ error: "Not found" }, 404);
    return json(rowToExec(rows[0]));
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[fix-archive] FIX Archive running on port ${PORT}`);
