import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { fixArchivePool } from "../lib/db.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("FIX_ARCHIVE_PORT")) || 5_012;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

type PendingExec = [
  string,
  string,
  string | null,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  number,
  string | null,
  string | null,
  number | null,
  string | null,
  string,
  Date,
];

const writeQueue: PendingExec[] = [];
let flushing = false;

async function flushWriteQueue() {
  if (flushing || writeQueue.length === 0) return;
  flushing = true;
  const batch = writeQueue.splice(0, 50);
  const client = await fixArchivePool.connect();
  try {
    await client.queryArray("BEGIN");
    for (const row of batch) {
      await client.queryArray(
        `INSERT INTO fix_archive.executions
           (exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
            leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
            commission, settl_date, transact_time, ts)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (exec_id) DO UPDATE SET
           ord_status = EXCLUDED.ord_status,
           leaves_qty = EXCLUDED.leaves_qty,
           cum_qty    = EXCLUDED.cum_qty,
           avg_px     = EXCLUDED.avg_px,
           last_qty   = EXCLUDED.last_qty,
           last_px    = EXCLUDED.last_px,
           ts         = EXCLUDED.ts`,
        row,
      );
    }
    await client.queryArray("COMMIT");
  } catch {
    await client.queryArray("ROLLBACK").catch(() => {});
  } finally {
    client.release();
    flushing = false;
  }
}

setInterval(() => {
  flushWriteQueue().catch(() => {});
}, 50);

createConsumer("fix-archive", ["fix.execution"]).then((consumer) => {
  consumer.onMessage((_topic, raw) => {
    const r = raw as ExecReport;
    writeQueue.push([
      r.execId,
      r.clOrdId,
      r.origClOrdId ?? null,
      r.symbol,
      r.side,
      r.execType,
      r.ordStatus,
      r.leavesQty,
      r.cumQty,
      r.avgPx,
      r.lastQty,
      r.lastPx,
      r.venue ?? null,
      r.counterparty ?? null,
      r.commission ?? null,
      r.settlDate ?? null,
      r.transactTime,
      new Date(r.ts),
    ]);
  });
}).catch((err) => console.warn("[fix-archive] Cannot subscribe:", err.message));

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// deno-lint-ignore no-explicit-any
function rowToExec(r: any[]) {
  const [
    execId,
    clOrdId,
    origClOrdId,
    symbol,
    side,
    execType,
    ordStatus,
    leavesQty,
    cumQty,
    avgPx,
    lastQty,
    lastPx,
    venue,
    counterparty,
    commission,
    settlDate,
    transactTime,
    ts,
  ] = r;
  return {
    execId,
    clOrdId,
    origClOrdId,
    symbol,
    side,
    execType,
    ordStatus,
    leavesQty,
    cumQty,
    avgPx,
    lastQty,
    lastPx,
    venue,
    counterparty,
    commission,
    settlDate,
    transactTime,
    ts: ts instanceof Date ? ts.getTime() : ts,
  };
}

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path === "/health" && req.method === "GET") {
    try {
      const client = await Promise.race([
        fixArchivePool.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("db timeout")), 2_000)
        ),
      ]);
      try {
        const { rows } = await client.queryArray(
          "SELECT COUNT(*) FROM fix_archive.executions",
        );
        return json({
          service: "fix-archive",
          version: VERSION,
          status: "ok",
          executions: Number(rows[0][0]),
        });
      } finally {
        client.release();
      }
    } catch {
      return json({
        service: "fix-archive",
        version: VERSION,
        status: "ok",
        executions: 0,
        db: "unavailable",
      });
    }
  }

  const COLS =
    `exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
    leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
    commission, settl_date, transact_time, ts`;

  if (path === "/executions" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);
    const from = new Date(Number(url.searchParams.get("from") ?? 0));
    const to = new Date(Number(url.searchParams.get("to") ?? Date.now() + 1));

    const client = await fixArchivePool.connect();
    try {
      const { rows } = symbol
        ? await client.queryArray(
          `SELECT ${COLS} FROM fix_archive.executions WHERE symbol=$1 AND ts>=$2 AND ts<$3 ORDER BY ts DESC LIMIT $4`,
          [symbol, from, to, limit],
        )
        : await client.queryArray(
          `SELECT ${COLS} FROM fix_archive.executions WHERE ts>=$1 AND ts<$2 ORDER BY ts DESC LIMIT $3`,
          [from, to, limit],
        );
      return json(rows.map(rowToExec));
    } finally {
      client.release();
    }
  }

  const match = path.match(/^\/executions\/(.+)$/);
  if (match && req.method === "GET") {
    const client = await fixArchivePool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT ${COLS} FROM fix_archive.executions WHERE exec_id=$1`,
        [match[1]],
      );
      if (rows.length === 0) return json({ error: "Not found" }, 404);
      return json(rowToExec(rows[0]));
    } finally {
      client.release();
    }
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[fix-archive] running on port ${PORT}`);
