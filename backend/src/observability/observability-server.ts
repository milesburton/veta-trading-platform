import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("OBSERVABILITY_PORT")) || 5007;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type ObsEvent = { type: string; ts?: number; payload?: Record<string, unknown> };

const broadcaster = new EventTarget();

function sendToClients(evt: ObsEvent) {
  broadcaster.dispatchEvent(new CustomEvent("event", { detail: evt }));
}

// DB persistence (retain a single trading day)
const DB_PATH = Deno.env.get("OBS_DB_PATH") || "./backend/data/observability.db";
const RETENTION_MS = Number(Deno.env.get("OBS_RETENTION_MS")) || 24 * 60 * 60 * 1000; // 24 hours

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);
db.query("PRAGMA journal_mode=WAL");
db.query("PRAGMA synchronous=NORMAL");
db.query("PRAGMA cache_size=-32000"); // 32 MB — large DB benefits from bigger cache
db.query("PRAGMA busy_timeout=5000");
db.query(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  payload TEXT
);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);`);

// ── High-frequency in-memory buffers (not persisted to DB) ───────────────────
// These event types flood SQLite if persisted; serve from memory instead.
const NO_PERSIST_TYPES = new Set(["algo.heartbeat", "user.access"]);
const MAX_IN_MEMORY_EVENTS = 200;
const inMemoryBuffers = new Map<string, ObsEvent[]>();

function inMemoryAppend(evt: ObsEvent) {
  let buf = inMemoryBuffers.get(evt.type);
  if (!buf) { buf = []; inMemoryBuffers.set(evt.type, buf); }
  buf.push(evt);
  if (buf.length > MAX_IN_MEMORY_EVENTS) buf.shift();
}

// ── Batched write queue ───────────────────────────────────────────────────────
// SQLite writes are synchronous and block the Deno event loop. Buffer incoming
// events and flush in a single transaction every 50ms to keep the loop free
// for HTTP handlers between flushes.
type PendingObs = [string, number, string | null];
const writeQueue: PendingObs[] = [];
const OBS_FLUSH_BATCH = 50;
let pruneScheduled = false;

function flushObsWriteQueue() {
  if (writeQueue.length === 0) return;
  const batch = writeQueue.splice(0, OBS_FLUSH_BATCH);
  try {
    db.query("BEGIN");
    for (const [type, ts, payload] of batch) {
      db.query("INSERT INTO events (type, ts, payload) VALUES (?, ?, ?);", [type, ts, payload]);
    }
    db.query("COMMIT");
  } catch {
    try { db.query("ROLLBACK"); } catch { /* ignore */ }
  }
  if (!pruneScheduled) {
    pruneScheduled = true;
    setTimeout(() => {
      pruneScheduled = false;
      try { db.query("DELETE FROM events WHERE ts < ?;", [Date.now() - RETENTION_MS]); } catch { /* ignore */ }
    }, 10_000);
  }
}

setInterval(flushObsWriteQueue, 50);

function persistEvent(evt: ObsEvent) {
  const payload = evt.payload ? JSON.stringify(evt.payload) : null;
  writeQueue.push([evt.type, evt.ts ?? Date.now(), payload]);
}

function ingestEvent(evt: ObsEvent) {
  if (NO_PERSIST_TYPES.has(evt.type)) {
    inMemoryAppend(evt);
  } else {
    persistEvent(evt);
  }
  sendToClients(evt);
}

function loadRecent(limit = 1000, typeFilter?: string) {
  // Non-persisted types are served from in-memory buffers.
  if (typeFilter && NO_PERSIST_TYPES.has(typeFilter)) {
    const buf = inMemoryBuffers.get(typeFilter) ?? [];
    return buf.slice(-limit).reverse();
  }

  const rows = [] as ObsEvent[];
  const sql = typeFilter
    ? "SELECT id, type, ts, payload FROM events WHERE ts >= ? AND type = ? ORDER BY ts DESC LIMIT ?;"
    : "SELECT id, type, ts, payload FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT ?;";
  const params = typeFilter
    ? [Date.now() - RETENTION_MS, typeFilter, limit]
    : [Date.now() - RETENTION_MS, limit];
  for (const [_id, type, ts, payload] of db.query(sql, params)) {
    let parsed = null;
    try {
      parsed = payload ? JSON.parse(payload as string) : null;
    } catch {
      parsed = null;
    }
    rows.push({ type: type as string, ts: ts as number, payload: parsed });
  }
  return rows;
}

// ── Redpanda consumer ────────────────────────────────────────────────────────
// Subscribe to all system topics; each message becomes an observability event.
// Non-fatal if Redpanda is not yet available — HTTP POST still works as fallback.
// Three consumer groups with different priorities:
//
// LOW_FREQ_TOPICS: low-volume lifecycle events — dedicated consumer so they're
//   never queued behind high-frequency fill/child events.
// HIGH_FREQ_TOPICS: child slices and fills — high volume, separate consumer.
// HEARTBEAT_TOPICS: algo heartbeats — separate so they don't block order events.
// market.ticks is excluded entirely (available via market-sim WS).
//
// All groups use per-instance IDs so each restart begins from the latest offset
// rather than replaying a potentially large historical backlog.
// Order lifecycle events — critical, must not be delayed by volume spikes.
const ORDER_LIFECYCLE_TOPICS = [
  "orders.submitted",
  "orders.routed",
  "orders.expired",
  "orders.rejected",
  "orders.cancelled",
  "orders.resumed",
  "orders.kill.audit",
  "orders.resume.audit",
  "user.session",
];

// High-volume topics get their own consumer so they don't block lifecycle events.
const HIGH_FREQ_TOPICS = ["orders.child", "orders.filled", "user.access", "grid.query"];
const HEARTBEAT_TOPICS = ["algo.heartbeat"];

const instanceId = Date.now().toString(36);
const ORDER_GROUP = `observability-ord-${instanceId}`;
const HIGH_GROUP  = `observability-high-${instanceId}`;
const HB_GROUP    = `observability-hb-${instanceId}`;

function makeIngestConsumer(group: string, topics: string[]) {
  createConsumer(group, topics).then((consumer) => {
    consumer.onMessage((topic, value) => {
      ingestEvent({ type: topic, ts: Date.now(), payload: value as Record<string, unknown> });
    });
    console.log(`[observability] ${group} subscribed to: ${topics.join(", ")}`);
  }).catch((err) => {
    console.warn(`[observability] ${group} unavailable:`, err.message);
  });
}

makeIngestConsumer(ORDER_GROUP, ORDER_LIFECYCLE_TOPICS);
makeIngestConsumer(HIGH_GROUP,  HIGH_FREQ_TOPICS);
makeIngestConsumer(HB_GROUP,    HEARTBEAT_TOPICS);

// ── HTTP handlers ─────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ service: "observability", version: VERSION, status: "ok" }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (req.method === "GET" && url.pathname === "/health/all") {
    const services = [
      { name: "market-sim",    url: `http://localhost:${Deno.env.get("MARKET_SIM_PORT") ?? 5000}/health` },
      { name: "ems",           url: `http://localhost:${Deno.env.get("EMS_PORT") ?? 5001}/health` },
      { name: "oms",           url: `http://localhost:${Deno.env.get("OMS_PORT") ?? 5002}/health` },
      { name: "limit-algo",    url: `http://localhost:${Deno.env.get("ALGO_TRADER_PORT") ?? 5003}/health` },
      { name: "twap-algo",     url: `http://localhost:${Deno.env.get("TWAP_ALGO_PORT") ?? 5004}/health` },
      { name: "pov-algo",      url: `http://localhost:${Deno.env.get("POV_ALGO_PORT") ?? 5005}/health` },
      { name: "vwap-algo",     url: `http://localhost:${Deno.env.get("VWAP_ALGO_PORT") ?? 5006}/health` },
      { name: "observability", url: `http://localhost:${PORT}/health` },
      { name: "user-service",  url: `http://localhost:${Deno.env.get("USER_SERVICE_PORT") ?? 5008}/health` },
      { name: "journal",       url: `http://localhost:${Deno.env.get("JOURNAL_PORT") ?? 5009}/health` },
    ];
    const results = await Promise.all(
      services.map(async (svc) => {
        try {
          const r = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
          return { name: svc.name, status: r.ok ? "ok" : "error" };
        } catch {
          return { name: svc.name, status: "unavailable" };
        }
      }),
    );
    const allOk = results.every((r) => r.status === "ok");
    return new Response(
      JSON.stringify({ status: allOk ? "ok" : "degraded", services: results }),
      { status: allOk ? 200 : 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const typeFilter = url.searchParams.get("type") ?? undefined; // e.g. ?type=algo.heartbeat
    const rows = loadRecent(1000, typeFilter);
    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Server-Sent Events stream
  if (req.method === "GET" && url.pathname === "/stream") {
    let cleanup: (() => void) | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const onEvent = (e: Event) => {
          const detail = (e as CustomEvent).detail as ObsEvent;
          const payload = `data: ${JSON.stringify(detail)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };
        broadcaster.addEventListener("event", onEvent);
        // send a heartbeat occasionally to keep connections alive
        const hb = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(":\n\n"));
        }, 25_000);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", ts: Date.now() })}\n\n`));

        cleanup = () => {
          broadcaster.removeEventListener("event", onEvent);
          clearInterval(hb);
        };
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", ...CORS_HEADERS },
    });
  }

  // HTTP POST fallback — kept for backwards compat and local dev without Redpanda
  if (req.method === "POST" && url.pathname === "/events") {
    let body: ObsEvent | null = null;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: "invalid json" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const evt: ObsEvent = { ts: Date.now(), ...(body as ObsEvent) };
    ingestEvent(evt);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (req.method === "POST" && url.pathname === "/events/batch") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: "invalid json" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ success: false, message: "expected array" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    const now = Date.now();
    for (const item of body as ObsEvent[]) {
      ingestEvent({ ts: now, ...item });
    }
    return new Response(JSON.stringify({ success: true, count: (body as ObsEvent[]).length }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

Deno.serve({ port: PORT }, handle);
