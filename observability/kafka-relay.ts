/**
 * kafka-relay — minimal Kafka → stdout relay for LGTM observability stack.
 *
 * Consumes all trading system Kafka topics and writes each event as a single
 * JSON line to stdout. Grafana Alloy tails the supervisord log file and ships
 * the structured lines to Loki.
 *
 * Also exposes GET /health on port 5007 (same port as the old observability
 * service) so the frontend ServiceHealthPanel continues to resolve it.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer } from "../backend/src/lib/messaging.ts";

const PORT = Number(Deno.env.get("OBSERVABILITY_PORT")) || 5007;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

// ── Kafka topic groups (same as old observability-server.ts) ──────────────────

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

const HIGH_FREQ_TOPICS = ["orders.child", "orders.filled", "user.access", "grid.query"];
const HEARTBEAT_TOPICS = ["algo.heartbeat"];

const instanceId = Date.now().toString(36);
const ORDER_GROUP = `relay-ord-${instanceId}`;
const HIGH_GROUP  = `relay-high-${instanceId}`;
const HB_GROUP    = `relay-hb-${instanceId}`;

function relayTopic(group: string, topics: string[]) {
  createConsumer(group, topics).then((consumer) => {
    consumer.onMessage((topic, value) => {
      // Single JSON line → Alloy tails this via supervisord log → Loki
      console.log(JSON.stringify({ type: topic, ts: Date.now(), payload: value, service: "kafka-relay" }));
    });
    console.log(`[kafka-relay] ${group} subscribed: ${topics.join(", ")}`);
  }).catch((err) => {
    console.warn(`[kafka-relay] ${group} unavailable: ${err.message}`);
  });
}

relayTopic(ORDER_GROUP, ORDER_LIFECYCLE_TOPICS);
relayTopic(HIGH_GROUP,  HIGH_FREQ_TOPICS);
relayTopic(HB_GROUP,    HEARTBEAT_TOPICS);

// ── Health endpoint ───────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return json({ service: "kafka-relay", version: VERSION, status: "ok" });
  }

  // Accept a batch of events from the frontend or other services and log them.
  if (req.method === "POST" && url.pathname === "/events/batch") {
    const events = await req.json() as unknown[];
    const arr = Array.isArray(events) ? events : [events];
    for (const ev of arr) {
      console.log(JSON.stringify({ ...(ev as object), _source: "batch", service: "kafka-relay" }));
    }
    return json({ success: true, count: arr.length });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[kafka-relay] listening on :${PORT}`);
