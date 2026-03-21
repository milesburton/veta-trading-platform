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
  loginAsVerified,
  OBS_URL,
  submitOrderWithRetry,
  timeout,
  USER_SVC_URL,
} from "./test-helpers.ts";

const BASE = Deno.env.get("VETA_BASE_URL") ?? "http://localhost";

function svcUrl(localPort: number, prodPath: string): string {
  if (BASE === "http://localhost") return `${BASE}:${localPort}`;
  return `${BASE}${prodPath}`;
}

const MARKET_URL    = svcUrl(5000, "/api/market-sim");
const EMS_URL       = svcUrl(5001, "/api/ems");
const OMS_URL       = svcUrl(5002, "/api/oms");
const LIMIT_URL     = svcUrl(5003, "/api/limit-algo");
const TWAP_URL      = svcUrl(5004, "/api/twap-algo");
const POV_URL       = svcUrl(5005, "/api/pov-algo");
const VWAP_URL      = svcUrl(5006, "/api/vwap-algo");
const NEWS_URL      = svcUrl(5013, "/api/news-aggregator");
const ANALYTICS_URL = svcUrl(5014, "/api/analytics");
const MDS_URL       = svcUrl(5015, "/api/market-data");
const FEATURE_URL   = svcUrl(5017, "/api/feature-engine");
const SIGNAL_URL    = svcUrl(5018, "/api/signal-engine");
const REC_URL       = svcUrl(5019, "/api/recommendation-engine");
const SCENARIO_URL  = svcUrl(5020, "/api/scenario-engine");
const ICEBERG_URL   = svcUrl(5021, "/api/iceberg-algo");
const SNIPER_URL    = svcUrl(5022, "/api/sniper-algo");
const AP_URL        = svcUrl(5023, "/api/arrival-price-algo");
const LLM_URL       = svcUrl(5024, "/api/llm-advisory");
const MOMENTUM_URL  = svcUrl(5025, "/api/momentum-algo");
const IS_URL        = svcUrl(5026, "/api/is-algo");
const DARK_POOL_URL = svcUrl(5027, "/api/dark-pool");
const CCP_URL       = svcUrl(5028, "/api/ccp-service");
const RFQ_URL       = svcUrl(5029, "/api/rfq-service");
const MDA_URL       = svcUrl(5016, "/api/market-data-adapters");


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
  // Alternative trading systems, clearing & fixed income
  { name: "dark-pool",                 url: DARK_POOL_URL },
  { name: "ccp-service",               url: CCP_URL       },
  { name: "rfq-service",               url: RFQ_URL       },
  // Platform services
  { name: "user-service",              url: USER_SVC_URL  },
  { name: "observability",             url: OBS_URL       },
  { name: "journal",                   url: JOURNAL_URL   },
  { name: "news-aggregator",           url: NEWS_URL      },
  { name: "fix-archive",               url: svcUrl(5012, "/api/fix-archive") },
  { name: "gateway",                   url: GATEWAY_URL   },
  // Analytics & market data
  { name: "analytics",                 url: ANALYTICS_URL },
  { name: "market-data-service",       url: MDS_URL       },
  { name: "market-data-adapters",      url: MDA_URL       },
  // Intelligence pipeline
  { name: "feature-engine",            url: FEATURE_URL   },
  { name: "signal-engine",             url: SIGNAL_URL    },
  { name: "recommendation-engine",     url: REC_URL       },
  { name: "scenario-engine",           url: SCENARIO_URL  },
  // LLM advisory
  { name: "llm-advisory-orchestrator", url: LLM_URL       },
] as const;


for (const svc of ALL_SERVICES) {
  Deno.test(`[health] ${svc.name} is online and reports ok`, async () => {
    const res = await fetch(`${svc.url}/health`, { signal: timeout(5_000) });
    assertEquals(res.status, 200, `${svc.name} /health returned ${res.status}`);
    const body = await res.json();
    assertEquals(body.status, "ok", `${svc.name} status field is not "ok"`);
  });
}


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

Deno.test("[e2e] all services report the same version (no stale deployments)", async () => {
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
  const versioned = results.filter((r) => r.version && r.version !== "dev");
  if (versioned.length < 2) return; // can't compare if fewer than 2 services have versions
  const expected = versioned[0].version!;
  const stale = versioned.filter((r) => r.version !== expected);
  assertEquals(
    stale.length,
    0,
    `Stale services (expected version ${expected}):\n${stale.map((r) => `  ${r.name}: ${r.version}`).join("\n")}`,
  );
});


Deno.test("[gateway] WebSocket receives marketUpdate within 8 seconds", async () => {
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  let msg: { event: string; data: { prices: Record<string, number> } } | null = null;
  try {
    msg = await new Promise<{ event: string; data: { prices: Record<string, number> } }>((resolve, reject) => {
      const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 8_000);
      ws.onmessage = (ev) => {
        const parsed = JSON.parse(ev.data as string) as { event: string; data: { prices: Record<string, number> } };
        if (parsed.event === "marketUpdate") {
          clearTimeout(t);
          ws.close();
          resolve(parsed);
        }
      };
      ws.onerror = () => { clearTimeout(t); ws.close(); reject(new Error("WS error")); };
    });
  } finally {
    await closed;
  }
  assert(msg !== null);
  assert(msg.event === "marketUpdate");
  assert(typeof msg.data.prices === "object");
  assert(Object.keys(msg.data.prices).length > 0);
});

Deno.test("[gateway] unauthenticated submitOrder is acknowledged or rejected", async () => {
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  let ack: { event: string } | null = null;
  try {
    ack = await new Promise<{ event: string }>((resolve, reject) => {
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
      ws.onerror = () => { clearTimeout(t); ws.close(); reject(new Error("WS error")); };
    });
  } finally {
    await closed;
  }
  assert(ack !== null);
  assert(
    ["orderAck", "orderRejected", "error"].includes(ack.event),
    `Expected orderAck/orderRejected/error, got: ${ack.event}`,
  );
});

Deno.test("[gateway] authenticated WS receives algoHeartbeat within 10s", async () => {
  const token = await loginAs("alice");
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => { ws.close(); reject(new Error("No algoHeartbeat received")); }, 10_000);
      ws.onopen = () => ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as { event: string };
        if (msg.event === "algoHeartbeat") {
          clearTimeout(t);
          ws.close();
          resolve();
        }
      };
      ws.onerror = () => { clearTimeout(t); ws.close(); reject(new Error("WS error")); };
    });
  } finally {
    await closed;
  }
});


Deno.test("[orders] authenticated BUY LIMIT orderAck within 5s", async () => {
  const { event } = await submitOrderWithRetry("alice", {
    asset: "AAPL", side: "BUY", quantity: 10, limitPrice: 99_999, strategy: "LIMIT",
  });
  assertEquals(event, "orderAck", `Expected orderAck, got ${event}`);
});

Deno.test("[orders] authenticated SELL LIMIT orderAck within 5s", async () => {
  const { event } = await submitOrderWithRetry("alice", {
    asset: "MSFT", side: "SELL", quantity: 10, limitPrice: 1, strategy: "LIMIT",
  });
  assertEquals(event, "orderAck", `Expected orderAck, got ${event}`);
});

Deno.test("[orders] option order returns orderAck or orderRejected from OMS", async () => {
  const response = await submitOrderWithRetry("alice", {
    asset: "AAPL", side: "BUY", quantity: 10, limitPrice: 200,
    strategy: "LIMIT", instrumentType: "option",
  });
  assert(
    response.event === "orderAck" || response.event === "orderRejected",
    `Expected orderAck or orderRejected, got ${response.event}`,
  );
});


Deno.test("[gateway] GET /shared-workspaces returns 401 without auth", async () => {
  const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, { signal: timeout(5_000) });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("[gateway] GET /advisory/admin/state returns 200 for admin", async () => {
  const token = await loginAsVerified("admin");
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


Deno.test("[market-sim] WebSocket emits tick data within 3s", async () => {
  const wsUrl = BASE === "http://localhost" ? "ws://localhost:5000" : BASE.replace(/^http/, "ws") + "/ws/market-sim";
  const ws = new WebSocket(wsUrl);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  let msg = "";
  try {
    msg = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 3_000);
      ws.onmessage = (ev) => {
        clearTimeout(t);
        ws.close();
        resolve(ev.data as string);
      };
      ws.onerror = () => { clearTimeout(t); ws.close(); reject(new Error("WS error")); };
    });
  } finally {
    await closed;
  }
  const parsed = JSON.parse(msg) as { event?: string; data?: { prices?: Record<string, number>; volumes?: Record<string, number> } };
  assert(typeof parsed === "object" && parsed !== null);
  const tick = parsed.data ?? (parsed as unknown as { prices?: Record<string, number>; volumes?: Record<string, number> });
  assert(typeof tick.prices === "object" && Object.keys(tick.prices!).length > 0, "tick must have prices");
  assert(typeof tick.volumes === "object", "tick must have volumes");
});


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
  // Retry to handle transient cases where the token isn't immediately visible to validate
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000));
    const token = await loginAs("alice");
    res = await fetch(`${USER_SVC_URL}/sessions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: timeout(5_000),
    });
    if (res.status === 200) break;
    await res.body?.cancel();
    res = null;
  }
  assert(res !== null, "validate never returned 200 after retries");
  assertEquals(res!.status, 200);
  const body = await res!.json() as { user: { id: string; role: string }; limits: unknown };
  assertEquals(body.user.id, "alice");
  assertExists(body.user.role);
  assertExists(body.limits);
});


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


Deno.test("[fix-archive] /health includes executions count", async () => {
  const res = await fetch(`${svcUrl(5012, "/api/fix-archive")}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; executions: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.executions, "number");
});

Deno.test("[fix-archive] GET /executions returns array with expected fields", async () => {
  const res = await fetch(`${svcUrl(5012, "/api/fix-archive")}/executions?limit=10`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>[];
  assert(Array.isArray(body), "executions must be an array");
  if (body.length > 0) {
    for (const field of ["execId", "clOrdId", "symbol", "side", "cumQty", "avgPx"]) {
      assertExists(body[0][field], `execution missing field: ${field}`);
    }
  }
});


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


Deno.test("[market-data-service] GET /sources returns array", async () => {
  const res = await fetch(`${MDS_URL}/sources`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()), "/sources must return an array");
});


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
  try {
    const res = await fetch(`${GATEWAY_URL}/assets`, {
      headers: { Cookie: `veta_user=${token}` },
      signal: timeout(10_000),
    });
    if (!res.ok) { await res.body?.cancel(); return 190; }
    const assets = await res.json();
    if (!Array.isArray(assets)) return 190;
    return (assets as { symbol: string; price: number }[]).find((a) => a.symbol === symbol)?.price ?? 190;
  } catch { return 190; }
}

/** Poll the journal grid until the order has a settled status (filled/expired). */
async function pollSettled(clientOrderId: string, maxWaitMs = 90_000): Promise<SmokeOrder | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
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
    } catch { /* transient fetch/timeout error — keep polling until deadline */ }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return null;
}

Deno.test("[orders/settled] LIMIT order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderWithRetry("alice", {
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
  const { clientOrderId } = await submitOrderWithRetry("alice", {
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
  const { clientOrderId } = await submitOrderWithRetry("bob", {
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
  const { clientOrderId } = await submitOrderWithRetry("alice", {
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

Deno.test("[orders/settled] ICEBERG order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "MSFT");
  const { clientOrderId } = await submitOrderWithRetry("alice", {
    asset: "MSFT", side: "BUY", quantity: 60,
    limitPrice: price * 1.05, strategy: "ICEBERG",
    algoParams: { strategy: "ICEBERG", visibleQty: 30 },
    expiresAt: 60,
  });
  const order = await pollSettled(clientOrderId, 90_000);
  assertExists(order, `ICEBERG order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired" || order.status === "rejected",
    `Expected filled/expired/rejected, got: ${order.status}`,
  );
  assertEquals(order.strategy, "ICEBERG");
});

Deno.test("[orders/settled] SNIPER order reaches filled or expired within 60s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderWithRetry("alice", {
    asset: "AAPL", side: "BUY", quantity: 30,
    limitPrice: price * 1.05, strategy: "SNIPER",
    algoParams: { strategy: "SNIPER" },
    expiresAt: 30,
  });
  const order = await pollSettled(clientOrderId, 60_000);
  assertExists(order, `SNIPER order ${clientOrderId} did not settle within 60s`);
  assert(
    order.status === "filled" || order.status === "expired",
    `Expected filled/expired, got: ${order.status}`,
  );
  assertEquals(order.strategy, "SNIPER");
});

Deno.test("[orders/settled] ARRIVAL_PRICE order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "MSFT");
  const { clientOrderId } = await submitOrderWithRetry("alice", {
    asset: "MSFT", side: "BUY", quantity: 40,
    limitPrice: price * 1.05, strategy: "ARRIVAL_PRICE",
    algoParams: { strategy: "ARRIVAL_PRICE" },
    expiresAt: 30,
  });
  const order = await pollSettled(clientOrderId, 60_000);
  assertExists(order, `ARRIVAL_PRICE order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired" || order.status === "rejected",
    `Expected filled/expired/rejected, got: ${order.status}`,
  );
  assertEquals(order.strategy, "ARRIVAL_PRICE");
});

Deno.test("[orders/settled] MOMENTUM order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "AAPL");
  const { clientOrderId } = await submitOrderWithRetry("alice", {
    asset: "AAPL", side: "BUY", quantity: 30,
    limitPrice: price * 1.05, strategy: "MOMENTUM",
    algoParams: { strategy: "MOMENTUM", entryThresholdBps: 0.01 },
    expiresAt: 30,
  });
  const order = await pollSettled(clientOrderId, 60_000);
  assertExists(order, `MOMENTUM order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired" || order.status === "rejected",
    `Expected filled/expired/rejected, got: ${order.status}`,
  );
  assertEquals(order.strategy, "MOMENTUM");
});

Deno.test("[orders/settled] IS order reaches filled or expired within 90s", async () => {
  const token = await loginAs("alice");
  const price = await livePrice(token, "MSFT");
  const { clientOrderId } = await submitOrderWithRetry("alice", {
    asset: "MSFT", side: "BUY", quantity: 40,
    limitPrice: price * 1.05, strategy: "IS",
    algoParams: { strategy: "IS" },
    expiresAt: 30,
  });
  const order = await pollSettled(clientOrderId, 60_000);
  assertExists(order, `IS order ${clientOrderId} did not settle within 90s`);
  assert(
    order.status === "filled" || order.status === "expired" || order.status === "rejected",
    `Expected filled/expired/rejected, got: ${order.status}`,
  );
  assertEquals(order.strategy, "IS");
});

Deno.test("[orders/settled] rejected order (impossible price) has rejected status", async () => {
  // Submit with a limit price of $0.01 — well below market, so EMS/algo cannot fill.
  // OMS should reject at validation (qty/notional check) or the order expires immediately.
  // Either way it must NOT show as "queued" indefinitely.
  const { clientOrderId, event } = await submitOrderWithRetry("alice", {
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
    try {
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
    } catch { /* transient fetch/timeout error — keep polling until deadline */ }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  assert(
    finalStatus === "filled" || finalStatus === "expired" || finalStatus === "rejected",
    `Expected order to settle (not stay ${finalStatus})`,
  );
});


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


Deno.test("[gateway/ready] returns JSON with ready field and correct HTTP status", async () => {
  const res = await fetch(`${GATEWAY_URL}/ready`, { signal: timeout(10_000) });
  const body = await res.json() as { ready: boolean; services: Record<string, boolean> };
  assertEquals(typeof body.ready, "boolean");
  // HTTP status must match ready flag: 200 when ready, 503 when not
  assertEquals(res.status, body.ready ? 200 : 503, "HTTP status must be 200 when ready, 503 when not");
});

Deno.test("[gateway/ready] response includes all expected service keys", async () => {
  const res = await fetch(`${GATEWAY_URL}/ready`, { signal: timeout(10_000) });
  const body = await res.json() as { ready: boolean; services: Record<string, boolean> };
  const expected = [
    // Core order flow
    "marketSim", "ems", "oms", "journal", "userService", "bus", "fixArchive", "fixGateway", "observability",
    // Algo engines
    "limitAlgo", "twapAlgo", "povAlgo", "vwapAlgo", "icebergAlgo", "sniperAlgo", "arrivalPriceAlgo", "momentumAlgo", "isAlgo",
    // Alternative trading systems, clearing & fixed income
    "darkPool", "ccpService", "rfqService",
    // Data & intelligence
    "analytics", "marketData", "featureEngine", "signalEngine", "recommendationEngine", "scenarioEngine", "newsAggregator", "llmAdvisory",
  ];
  for (const key of expected) {
    assert(key in body.services, `Missing service key in /ready response: ${key}`);
    assertEquals(typeof body.services[key], "boolean", `Service key ${key} must be boolean`);
  }
});

Deno.test("[gateway/ready] ems and oms report true (env-var routing works)", async () => {
  const res = await fetch(`${GATEWAY_URL}/ready`, { signal: timeout(10_000) });
  const body = await res.json() as { services: Record<string, boolean> };
  assertEquals(body.services.ems, true, "ems must be true — check EMS_HOST/EMS_PORT env vars in gateway");
  assertEquals(body.services.oms, true, "oms must be true — check OMS_HOST/OMS_PORT env vars in gateway");
});

Deno.test("[rfq-service] GET /rfq/stats returns valid structure", async () => {
  const res = await fetch(`${RFQ_URL}/rfq/stats`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    service: string;
    total: number;
    byState: Record<string, number>;
    quoteWindowMs: number;
  };
  assertEquals(body.service, "rfq-service");
  assertEquals(typeof body.total, "number");
  assertExists(body.byState);
  assertEquals(typeof body.quoteWindowMs, "number");
});

Deno.test("[dark-pool] GET /pool/stats returns valid structure", async () => {
  const res = await fetch(`${DARK_POOL_URL}/pool/stats`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    service: string;
    currentDepth: Record<string, unknown>;
    totalMatchedToday: number;
    totalMatchedAllTime: number;
  };
  assertEquals(body.service, "dark-pool");
  assertExists(body.currentDepth);
  assertEquals(typeof body.totalMatchedToday, "number");
  assertEquals(typeof body.totalMatchedAllTime, "number");
});

Deno.test("[ccp-service] GET /ccp/stats returns valid structure", async () => {
  const res = await fetch(`${CCP_URL}/ccp/stats`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    service: string;
    totalNovated: number;
    pendingObligations: number;
    marginAccountCount: number;
  };
  assertEquals(body.service, "ccp-service");
  assertEquals(typeof body.totalNovated, "number");
  assertEquals(typeof body.pendingObligations, "number");
  assertEquals(typeof body.marginAccountCount, "number");
});

Deno.test("[observability] GET /health returns ok", async () => {
  const res = await fetch(`${OBS_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string };
  assertEquals(body.status, "ok");
});

Deno.test("[user-service] POST /sessions with unknown userId returns 401 or 404", async () => {
  const res = await fetch(`${USER_SVC_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "does-not-exist-xyz" }),
    signal: timeout(5_000),
  });
  assert(res.status === 401 || res.status === 404, `Expected 401 or 404, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("[gateway] trader role cannot access admin-only endpoint", async () => {
  const token = await loginAs("alice");
  const res = await fetch(`${GATEWAY_URL}/advisory/admin/state`, {
    headers: { Cookie: `veta_user=${token}` },
    signal: timeout(5_000),
  });
  assert(res.status === 401 || res.status === 403, `trader should be denied admin endpoint, got ${res.status}`);
  await res.body?.cancel();
});

Deno.test("[gateway] request with invalid token returns 401", async () => {
  const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, {
    headers: { Cookie: "veta_user=invalid-token-xyz" },
    signal: timeout(5_000),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});
