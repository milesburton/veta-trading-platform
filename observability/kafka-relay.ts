/**
 * kafka-relay — minimal Kafka → stdout relay for LGTM observability stack.
 *
 * Consumes the topics listed below and writes each event as a single JSON
 * line to stdout. Grafana Alloy tails this container's Docker log output
 * directly (loki.source.docker) and ships the structured lines to Loki.
 *
 * Also exposes GET /health on port 5007 (same port as the old observability
 * service) so the frontend ServiceHealthPanel continues to resolve it.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer } from "../backend/src/lib/messaging.ts";

const PORT = Number(Deno.env.get("KAFKA_RELAY_PORT")) || 5007;
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

// Stable group ids (not timestamped) so each kafka-relay restart rejoins
// the same Kafka groups instead of orphaning the previous ones. Orphan
// groups never commit their offset again, so Redpanda's reported "lag"
// against them grows unboundedly and trips the
// RedpandaConsumerLagSustained alert (one alert per orphaned
// group × partition, fast).
//
// We currently run a single relay replica so the consumer groups don't
// need to be unique-per-instance. If the relay ever scales out, each
// replica would need a stable replica-id (e.g. POD_NAME or COMPOSE_PROJECT
// + container index) baked into the group name — never a wall-clock
// timestamp, which makes every restart a new orphan.
const ORDER_GROUP = "relay-ord";
const HIGH_GROUP = "relay-high";
const HB_GROUP = "relay-hb";

function relayTopic(group: string, topics: string[]) {
  createConsumer(group, topics)
    .then((consumer) => {
      consumer.onMessage((topic, value) => {
        // Single JSON line → Alloy tails this via supervisord log → Loki
        console.log(
          JSON.stringify({
            type: topic,
            ts: Date.now(),
            payload: value,
            service: "kafka-relay",
          })
        );
      });
      console.log(`[kafka-relay] ${group} subscribed: ${topics.join(", ")}`);
    })
    .catch((err) => {
      console.warn(`[kafka-relay] ${group} unavailable: ${err.message}`);
    });
}

relayTopic(ORDER_GROUP, ORDER_LIFECYCLE_TOPICS);
relayTopic(HIGH_GROUP, HIGH_FREQ_TOPICS);
relayTopic(HB_GROUP, HEARTBEAT_TOPICS);

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

  if (req.method === "POST" && url.pathname === "/events/batch") {
    const body = await req.json();
    let arr: unknown[];
    if (Array.isArray(body)) {
      arr = body;
    } else if (
      body &&
      typeof body === "object" &&
      Array.isArray((body as { events?: unknown }).events)
    ) {
      arr = (body as { events: unknown[] }).events;
    } else {
      arr = [body];
    }
    for (const ev of arr) {
      console.log(
        JSON.stringify({
          ...(ev as object),
          _source: "batch",
          service: "kafka-relay",
        })
      );
    }
    return json({ success: true, count: arr.length });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[kafka-relay] listening on :${PORT}`);
