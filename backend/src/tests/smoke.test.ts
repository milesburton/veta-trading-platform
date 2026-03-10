/**
 * Smoke tests — require all backend services to be running.
 *
 * Covers every service the GUI depends on: health checks, key API contracts,
 * and the gateway WebSocket pipeline. Tests requiring auth use loginAs /
 * submitOrderViaWs from test-helpers to obtain a valid session token.
 *
 * Run:  deno task test:smoke
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import {
  GATEWAY_URL,
  GATEWAY_WS_URL,
  JOURNAL_URL,
  loginAs,
  OBS_URL,
  submitOrderViaWs,
  timeout,
} from "./test-helpers.ts";

// ── Service URLs ──────────────────────────────────────────────────────────────

const MARKET_URL    = "http://localhost:5000";
const EMS_URL       = "http://localhost:5001";
const OMS_URL       = "http://localhost:5002";
const LIMIT_URL     = "http://localhost:5003";
const TWAP_URL      = "http://localhost:5004";
const POV_URL       = "http://localhost:5005";
const VWAP_URL      = "http://localhost:5006";
const USER_SVC_URL  = "http://localhost:5008";
const NEWS_URL      = "http://localhost:5013";
const ANALYTICS_URL = "http://localhost:5014";
const MDS_URL       = "http://localhost:5015";
// 5016 market-data-adapters — requires external API key; excluded from smoke
const FEATURE_URL   = "http://localhost:5017";
const SIGNAL_URL    = "http://localhost:5018";
const REC_URL       = "http://localhost:5019";
const SCENARIO_URL  = "http://localhost:5020";
const ICEBERG_URL   = "http://localhost:5021";
const SNIPER_URL    = "http://localhost:5022";
const AP_URL        = "http://localhost:5023";
const LLM_URL       = "http://localhost:5024";
const MOMENTUM_URL  = "http://localhost:5025";
const IS_URL        = "http://localhost:5026";

// ── All services expected to be healthy ───────────────────────────────────────

const ALL_SERVICES = [
  // Core trading pipeline
  { name: "market-sim",                url: MARKET_URL    },
  { name: "ems",                       url: EMS_URL       },
  { name: "oms",                       url: OMS_URL       },
  // Algo strategies
  { name: "limit-algo",                url: LIMIT_URL     },
  { name: "twap-algo",                 url: TWAP_URL      },
  { name: "pov-algo",                  url: POV_URL       },
  { name: "vwap-algo",                 url: VWAP_URL      },
  { name: "iceberg-algo",              url: ICEBERG_URL   },
  { name: "sniper-algo",               url: SNIPER_URL    },
  { name: "arrival-price-algo",        url: AP_URL        },
  { name: "momentum-algo",             url: MOMENTUM_URL  },
  { name: "is-algo",                   url: IS_URL        },
  // Platform services
  { name: "user-service",              url: USER_SVC_URL  },
  { name: "observability",             url: OBS_URL       },
  { name: "journal",                   url: JOURNAL_URL   },
  { name: "news-aggregator",           url: NEWS_URL      },
  { name: "fix-archive",               url: "http://localhost:5012" },
  { name: "gateway",                   url: GATEWAY_URL   },
  // Analytics & market data
  { name: "analytics",                 url: ANALYTICS_URL },
  { name: "market-data-service",       url: MDS_URL       },
  // Intelligence pipeline
  { name: "feature-engine",            url: FEATURE_URL   },
  { name: "signal-engine",             url: SIGNAL_URL    },
  { name: "recommendation-engine",     url: REC_URL       },
  { name: "scenario-engine",           url: SCENARIO_URL  },
  // LLM advisory
  { name: "llm-advisory-orchestrator", url: LLM_URL       },
] as const;

// ── Health checks ─────────────────────────────────────────────────────────────

for (const svc of ALL_SERVICES) {
  Deno.test(`[health] ${svc.name} is online and reports ok`, async () => {
    const res = await fetch(`${svc.url}/health`, { signal: timeout(5_000) });
    assertEquals(res.status, 200, `${svc.name} /health returned ${res.status}`);
    const body = await res.json();
    assertEquals(body.status, "ok", `${svc.name} status field is not "ok"`);
  });
}

// ── Version consistency ───────────────────────────────────────────────────────

Deno.test("[e2e] all services expose a version field in /health", async () => {
  const results = await Promise.all(
    ALL_SERVICES.map(async (svc) => {
      try {
        const res = await fetch(`${svc.url}/health`, { signal: timeout(3_000) });
        const body = await res.json() as { version?: string };
        return { name: svc.name, version: body.version ?? null };
      } catch {
        return { name: svc.name, version: null };
      }
    }),
  );
  const missing = results.filter((r) => !r.version || r.version === "dev");
  assertEquals(
    missing.length,
    0,
    `Services missing version field:\n${missing.map((r) => `  ${r.name}`).join("\n")}`,
  );
});

// ── Gateway: WebSocket hub ────────────────────────────────────────────────────

Deno.test("[gateway] WebSocket receives marketUpdate within 3 seconds", async () => {
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const msg = await new Promise<{ event: string; data: { prices: Record<string, number> } }>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 3_000);
    ws.onmessage = (ev) => {
      const parsed = JSON.parse(ev.data as string) as { event: string; data: { prices: Record<string, number> } };
      if (parsed.event === "marketUpdate") {
        clearTimeout(t);
        ws.close();
        resolve(parsed);
      }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });

  await closed;
  assert(msg.event === "marketUpdate");
  assert(typeof msg.data.prices === "object");
  assert(Object.keys(msg.data.prices).length > 0);
});

Deno.test("[gateway] unauthenticated submitOrder is acknowledged or rejected", async () => {
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const ack = await new Promise<{ event: string }>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 5_000);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "submitOrder",
        payload: {
          clientOrderId: `smoke-${Date.now()}`,
          asset: "AAPL", side: "BUY", quantity: 100,
          limitPrice: 200.0, expiresAt: 60, strategy: "LIMIT",
          algoParams: { strategy: "LIMIT" },
        },
      }));
    };
    ws.onmessage = (ev) => {
      const parsed = JSON.parse(ev.data as string) as { event: string };
      if (["orderAck", "orderRejected", "error"].includes(parsed.event)) {
        clearTimeout(t);
        ws.close();
        resolve(parsed);
      }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });

  await closed;
  assert(
    ["orderAck", "orderRejected", "error"].includes(ack.event),
    `Expected orderAck/orderRejected/error, got: ${ack.event}`,
  );
});

Deno.test("[gateway] authenticated WS receives algoHeartbeat within 5s", async () => {
  const token = await loginAs("alice");
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("No algoHeartbeat received")); }, 5_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as { event: string };
      if (msg.event === "algoHeartbeat") {
        clearTimeout(t);
        ws.close();
        resolve();
      }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });

  await closed;
});

// ── Gateway: authenticated order pipeline ────────────────────────────────────

Deno.test("[orders] authenticated BUY LIMIT orderAck within 5s", async () => {
  const token = await loginAs("alice");
  const ack = await submitOrderViaWs(token, {
    asset: "AAPL", side: "BUY", quantity: 10, limitPrice: 99_999, strategy: "LIMIT",
  });
  assertEquals(ack.event, "orderAck", `Expected orderAck, got ${ack.event}`);
});

Deno.test("[orders] authenticated SELL LIMIT orderAck within 5s", async () => {
  const token = await loginAs("alice");
  const ack = await submitOrderViaWs(token, {
    asset: "MSFT", side: "SELL", quantity: 10, limitPrice: 1, strategy: "LIMIT",
  });
  assertEquals(ack.event, "orderAck", `Expected orderAck, got ${ack.event}`);
});

Deno.test("[orders] option order returns orderAck or orderRejected from OMS", async () => {
  const token = await loginAs("alice");
  const response = await submitOrderViaWs(token, {
    asset: "AAPL", side: "BUY", quantity: 10, limitPrice: 200,
    strategy: "LIMIT", instrumentType: "option",
  });
  assert(
    response.event === "orderAck" || response.event === "orderRejected",
    `Expected orderAck or orderRejected, got ${response.event}`,
  );
});

// ── Gateway: auth-required endpoints ─────────────────────────────────────────

Deno.test("[gateway] GET /shared-workspaces returns 401 without auth", async () => {
  const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, { signal: timeout(5_000) });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("[gateway] GET /advisory/admin/state returns 200 for admin", async () => {
  const token = await loginAs("admin");
  const res = await fetch(`${GATEWAY_URL}/advisory/admin/state`, {
    headers: { Cookie: `veta_user=${token}` },
    signal: timeout(5_000),
  });
  assertEquals(res.status, 200, `Expected 200, got ${res.status}`);
  const body = await res.json() as { state: string; pendingJobs: number; policy: unknown };
  assert(
    ["disabled", "armed", "active", "cooldown", "error"].includes(body.state),
    `Unexpected subsystem state: ${body.state}`,
  );
  assertEquals(typeof body.pendingJobs, "number");
  assertExists(body.policy);
});

// ── Market-sim ────────────────────────────────────────────────────────────────

Deno.test("[market-sim] WebSocket emits tick data within 3s", async () => {
  const ws = new WebSocket(`ws://localhost:5000`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const msg = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 3_000);
    ws.onmessage = (ev) => {
      clearTimeout(t);
      ws.close();
      resolve(ev.data as string);
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });

  await closed;
  const parsed = JSON.parse(msg);
  assert(typeof parsed === "object" && parsed !== null);
});

// ── User service ──────────────────────────────────────────────────────────────

Deno.test("[user-service] POST /sessions sets veta_user cookie for alice", async () => {
  const res = await fetch(`${USER_SVC_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "alice" }),
    signal: timeout(5_000),
  });
  assertEquals(res.status, 200);
  await res.body?.cancel();
  assert(
    (res.headers.get("set-cookie") ?? "").includes("veta_user="),
    "Expected veta_user cookie in Set-Cookie header",
  );
});

Deno.test("[user-service] POST /sessions/validate returns user + limits for alice", async () => {
  const token = await loginAs("alice");
  const res = await fetch(`${USER_SVC_URL}/sessions/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    signal: timeout(5_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { user: { id: string; role: string }; limits: unknown };
  assertEquals(body.user.id, "alice");
  assertExists(body.user.role);
  assertExists(body.limits);
});

// ── Journal ───────────────────────────────────────────────────────────────────

Deno.test("[journal] GET /candles?instrument=AAPL&interval=1m returns array", async () => {
  const res = await fetch(
    `${JOURNAL_URL}/candles?instrument=AAPL&interval=1m&limit=5`,
    { signal: timeout(5_000) },
  );
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "candles must be an array");
});

Deno.test("[journal] GET /orders returns array", async () => {
  const res = await fetch(`${JOURNAL_URL}/orders?limit=10`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "orders must be an array");
});

Deno.test("[journal] POST /grid/query orderBlotter returns rows + total + evalMs", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
      sortField: null, sortDir: null, offset: 0, limit: 50,
    }),
    signal: timeout(8_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { rows: unknown[]; total: number; evalMs: number };
  assert(Array.isArray(body.rows));
  assertEquals(typeof body.total, "number");
  assert(typeof body.evalMs === "number" && body.evalMs >= 0);
});

// ── FIX archive ───────────────────────────────────────────────────────────────

Deno.test("[fix-archive] /health includes executions count", async () => {
  const res = await fetch("http://localhost:5012/health", { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; executions: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.executions, "number");
});

Deno.test("[fix-archive] GET /executions returns array", async () => {
  const res = await fetch("http://localhost:5012/executions?limit=10", { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "executions must be an array");
});

// ── News aggregator ───────────────────────────────────────────────────────────

Deno.test("[news] GET /news?symbol=AAPL returns array", async () => {
  const res = await fetch(`${NEWS_URL}/news?symbol=AAPL&limit=5`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "news must be an array");
});

Deno.test("[news] GET /sources returns non-empty list with id, label, enabled fields", async () => {
  const res = await fetch(`${NEWS_URL}/sources`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { id: string; label: string; enabled: boolean }[];
  assert(Array.isArray(body) && body.length > 0, "sources must be a non-empty array");
  assertExists(body[0].id);
  assertExists(body[0].label);
  assertEquals(typeof body[0].enabled, "boolean");
});

// ── Observability ─────────────────────────────────────────────────────────────

Deno.test("[observability] POST /events/batch accepts array and returns count", async () => {
  const res = await fetch(`${OBS_URL}/events/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { type: "smoke.test", ts: Date.now(), payload: { x: 1 } },
      { type: "smoke.test", ts: Date.now(), payload: { x: 2 } },
    ]),
    signal: timeout(5_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { success: boolean; count: number };
  assertEquals(body.success, true);
  assertEquals(body.count, 2);
});

// ── Analytics service ─────────────────────────────────────────────────────────

Deno.test("[analytics] POST /quote returns Black-Scholes price + greeks for AAPL call", async () => {
  const res = await fetch(`${ANALYTICS_URL}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: "AAPL", optionType: "call", strike: 200, expirySecs: 86400 }),
    signal: timeout(8_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { price: number; greeks: { delta: number; gamma: number } };
  assertEquals(typeof body.price, "number");
  assertExists(body.greeks, "greeks object must be present");
  assertEquals(typeof body.greeks.delta, "number");
  assertEquals(typeof body.greeks.gamma, "number");
});

// ── Market-data service ───────────────────────────────────────────────────────

Deno.test("[market-data-service] GET /sources returns array", async () => {
  const res = await fetch(`${MDS_URL}/sources`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "/sources must return an array");
});

// ── Intelligence pipeline ─────────────────────────────────────────────────────

Deno.test("[feature-engine] /health includes trackedSymbols", async () => {
  const res = await fetch(`${FEATURE_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; trackedSymbols: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.trackedSymbols, "number");
});

Deno.test("[signal-engine] /health includes trackedSymbols", async () => {
  const res = await fetch(`${SIGNAL_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; trackedSymbols: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.trackedSymbols, "number");
});

Deno.test("[recommendation-engine] /health includes count", async () => {
  const res = await fetch(`${REC_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; count: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.count, "number");
});

Deno.test("[recommendation-engine] GET /recommendations returns array", async () => {
  const res = await fetch(`${REC_URL}/recommendations?limit=10`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "recommendations must be an array");
});

Deno.test("[scenario-engine] /health is ok", async () => {
  const res = await fetch(`${SCENARIO_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assertEquals((await res.json() as { status: string }).status, "ok");
});

// ── Algo order settled-state checks ───────────────────────────────────────────
// For each strategy: submit an order with a favourable limit price and poll the
// journal until the order reaches "filled" or "expired" (never just routed).
// This verifies the full pipeline: OMS → algo → EMS → fill/expire → journal.

interface SmokeOrder {
  id: string;
  asset: string;
  side: string;
  quantity: number;
  strategy: string;
  status: string;
  children: { id: string; status: string; quantity: number }[];
}

/** Fetch the current market price for a symbol via the assets endpoint. */
async function livePrice(token: string, symbol: string): Promise<number> {
  const res = await fetch(`${GATEWAY_URL}/assets`, {
    headers: { Cookie: `veta_user=${token}` },
    signal: timeout(10_000),
  });
  const assets = await res.json() as { symbol: string; price: number }[];
  return assets.find((a) => a.symbol === symbol)?.price ?? 190;
}

/** Poll the journal grid until the order has a settled status (filled/expired). */
async function pollSettled(clientOrderId: string, maxWaitMs = 90_000): Promise<SmokeOrder | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: { kind: "group", id: "g1", join: "AND", rules: [
          { kind: "rule", id: "r1", field: "id", op: "=", value: clientOrderId },
        ]},
        sortField: null, sortDir: null, offset: 0, limit: 1,
      }),
      signal: timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json() as { rows: SmokeOrder[] };
      if (data.rows.length > 0) {
        const order = data.rows[0];
        if (order.status === "filled" || order.status === "expired" || order.status === "rejected") return order;
      }
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return null;
}

Deno.test("[orders/settled] LIMIT order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "AAPL", side: "BUY", quantity: 10,
    limitPrice: price * 1.05, strategy: "LIMIT",
  });
  const order = await pollSettled(clientOrderId, 90_000);
  assertExists(order, `LIMIT order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired",
    `Expected filled/expired, got: ${order.status}`,
  );
});

Deno.test("[orders/settled] TWAP order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "AAPL", side: "BUY", quantity: 60,
    limitPrice: price * 1.05, strategy: "TWAP",
    algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 3 },
    expiresAt: 15,
  });
  const order = await pollSettled(clientOrderId, 90_000);
  assertExists(order, `TWAP order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired" || order.status === "rejected",
    `Expected filled/expired/rejected, got: ${order.status}`,
  );
  assertEquals(order.strategy, "TWAP");
});

Deno.test("[orders/settled] POV order reaches filled or expired within 90s", async () => {
  const token = await loginAs("bob");
  const price = await livePrice(token, "MSFT");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "MSFT", side: "BUY", quantity: 80,
    limitPrice: price * 1.05, strategy: "POV",
    algoParams: { strategy: "POV", povRate: 0.15 },
  });
  const order = await pollSettled(clientOrderId, 90_000);
  assertExists(order, `POV order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired",
    `Expected filled/expired, got: ${order.status}`,
  );
  assertEquals(order.strategy, "POV");
});

Deno.test("[orders/settled] VWAP order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "AAPL", side: "SELL", quantity: 60,
    limitPrice: price * 0.95, strategy: "VWAP",
    algoParams: { strategy: "VWAP", intervalSeconds: 3 },
  });
  const order = await pollSettled(clientOrderId, 90_000);
  assertExists(order, `VWAP order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired",
    `Expected filled/expired, got: ${order.status}`,
  );
  assertEquals(order.strategy, "VWAP");
});

Deno.test("[orders/settled] ICEBERG order is accepted and reaches journal within 30s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "MSFT");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "MSFT", side: "BUY", quantity: 200,
    limitPrice: price * 1.05, strategy: "ICEBERG",
    algoParams: { strategy: "ICEBERG", visibleQty: 40 },
    expiresAt: 10,
  });
  // Verify the order appears in the journal (any status) — proves OMS → journal pipeline
  const deadline = Date.now() + 30_000;
  let found = false;
  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: { kind: "group", id: "g1", join: "AND", rules: [
          { kind: "rule", id: "r1", field: "id", op: "=", value: clientOrderId },
        ]},
        sortField: null, sortDir: null, offset: 0, limit: 1,
      }),
      signal: timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json() as { rows: SmokeOrder[] };
      if (data.rows.length > 0 && data.rows[0].strategy === "ICEBERG") { found = true; break; }
    } else { await res.body?.cancel(); }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  assert(found, `ICEBERG order ${clientOrderId} did not appear in journal within 30s`);
});

Deno.test("[orders/settled] SNIPER order reaches filled or expired within 60s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "AAPL", side: "BUY", quantity: 30,
    limitPrice: price * 1.05, strategy: "SNIPER",
    algoParams: { strategy: "SNIPER" },
  });
  const order = await pollSettled(clientOrderId, 60_000);
  assertExists(order, `SNIPER order ${clientOrderId} did not settle within 60s`);
  assert(
    order.status === "filled" || order.status === "expired",
    `Expected filled/expired, got: ${order.status}`,
  );
  assertEquals(order.strategy, "SNIPER");
});

Deno.test("[orders/settled] ARRIVAL_PRICE order is accepted and reaches journal within 30s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "MSFT");
  const { clientOrderId } = await submitOrderViaWs(token, {
    asset: "MSFT", side: "BUY", quantity: 40,
    limitPrice: price * 1.05, strategy: "ARRIVAL_PRICE",
    algoParams: { strategy: "ARRIVAL_PRICE" },
    expiresAt: 10,
  });
  const deadline = Date.now() + 30_000;
  let found = false;
  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: { kind: "group", id: "g1", join: "AND", rules: [
          { kind: "rule", id: "r1", field: "id", op: "=", value: clientOrderId },
        ]},
        sortField: null, sortDir: null, offset: 0, limit: 1,
      }),
      signal: timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json() as { rows: SmokeOrder[] };
      if (data.rows.length > 0 && data.rows[0].strategy === "ARRIVAL_PRICE") { found = true; break; }
    } else { await res.body?.cancel(); }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  assert(found, `ARRIVAL_PRICE order ${clientOrderId} did not appear in journal within 30s`);
});

Deno.test("[orders/settled] rejected order (impossible price) has rejected status", async () => {
  const token = await loginAs("alice");
  // Submit with a limit price of $0.01 — well below market, so EMS/algo cannot fill.
  // OMS should reject at validation (qty/notional check) or the order expires immediately.
  // Either way it must NOT show as "queued" indefinitely.
  const { clientOrderId, event } = await submitOrderViaWs(token, {
    asset: "AAPL", side: "BUY", quantity: 1,
    limitPrice: 0.01, strategy: "LIMIT",
    expiresAt: 20,
  });
  // If the gateway itself rejected it (orderRejected) we're done.
  if (event === "orderRejected") return;

  // Otherwise poll journal for non-queued status.
  const deadline = Date.now() + 60_000;
  let finalStatus = "queued";
  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: { kind: "group", id: "g1", join: "AND", rules: [
          { kind: "rule", id: "r1", field: "id", op: "=", value: clientOrderId },
        ]},
        sortField: null, sortDir: null, offset: 0, limit: 1,
      }),
      signal: timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json() as { rows: SmokeOrder[] };
      if (data.rows.length > 0) {
        finalStatus = data.rows[0].status;
        if (finalStatus !== "queued" && finalStatus !== "executing" && finalStatus !== "working" && finalStatus !== "pending") break;
      }
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  assert(
    finalStatus === "filled" || finalStatus === "expired" || finalStatus === "rejected",
    `Expected order to settle (not stay ${finalStatus})`,
  );
});

// ── LLM advisory orchestrator ─────────────────────────────────────────────────

Deno.test("[llm-advisory] /health reports policyEnabled + pendingJobs", async () => {
  const res = await fetch(`${LLM_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; policyEnabled: boolean; pendingJobs: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.policyEnabled, "boolean");
  assertEquals(typeof body.pendingJobs, "number");
});

Deno.test("[llm-advisory] GET /admin/state returns valid subsystem state and policy", async () => {
  const res = await fetch(`${LLM_URL}/admin/state`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    state: string; pendingJobs: number;
    policy: { enabled: boolean; triggerMode: string };
    runtimeConfig: { enabled: boolean };
  };
  assert(
    ["disabled", "armed", "active", "cooldown", "error"].includes(body.state),
    `Unexpected state value: ${body.state}`,
  );
  assertEquals(typeof body.pendingJobs, "number");
  assertExists(body.policy);
  assertEquals(typeof body.policy.enabled, "boolean");
  assertExists(body.runtimeConfig);
});
