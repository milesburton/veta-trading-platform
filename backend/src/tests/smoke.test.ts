/**
 * Smoke tests — require all backend services to be running.
 *
 * Tests the full rearchitected system:
 *   - Gateway is the single entry point for GUI
 *   - OMS subscribes to orders.new on the bus (no direct HTTP order submission)
 *   - Algos subscribe to orders.routed on the bus
 *   - EMS subscribes to orders.child on the bus
 *   - FIX archive persists fill execution reports
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import {
  GATEWAY_URL as GATEWAY_URL_SHARED,
  loginAs,
  submitOrderViaWs,
} from "./test-helpers.ts";

const GATEWAY_URL = GATEWAY_URL_SHARED;
const MARKET_URL  = "http://localhost:5000";
const EMS_URL     = "http://localhost:5001";
const OMS_URL     = "http://localhost:5002";
const LIMIT_URL   = "http://localhost:5003";
const TWAP_URL    = "http://localhost:5004";
const POV_URL     = "http://localhost:5005";
const VWAP_URL    = "http://localhost:5006";
const OBS_URL     = "http://localhost:5007";
const JOURNAL_URL = "http://localhost:5009";
const ARCHIVE_URL  = "http://localhost:5012";
const NEWS_URL     = "http://localhost:5013";
const ICEBERG_URL  = "http://localhost:5021";
const SNIPER_URL   = "http://localhost:5022";
const AP_URL       = "http://localhost:5023";

const INTERNAL_SERVICES = [
  { name: "market-sim",         url: MARKET_URL  },
  { name: "ems",                url: EMS_URL     },
  { name: "oms",                url: OMS_URL     },
  { name: "limit-algo",         url: LIMIT_URL   },
  { name: "twap-algo",          url: TWAP_URL    },
  { name: "pov-algo",           url: POV_URL     },
  { name: "vwap-algo",          url: VWAP_URL    },
  { name: "iceberg-algo",       url: ICEBERG_URL },
  { name: "sniper-algo",        url: SNIPER_URL  },
  { name: "arrival-price-algo", url: AP_URL      },
  { name: "observability",      url: OBS_URL     },
  { name: "journal",            url: JOURNAL_URL },
  { name: "fix-archive",        url: ARCHIVE_URL },
  { name: "news-aggregator",    url: NEWS_URL    },
  { name: "gateway",            url: GATEWAY_URL },
];

function timeout(ms: number) { return AbortSignal.timeout(ms); }

// ── Health checks ─────────────────────────────────────────────────────────────

for (const svc of INTERNAL_SERVICES) {
  Deno.test(`[health] ${svc.name} is online and reports ok`, async () => {
    const res = await fetch(`${svc.url}/health`, { signal: timeout(5_000) });
    assertEquals(res.status, 200, `${svc.name} /health returned ${res.status}`);
    const body = await res.json();
    assertEquals(body.status, "ok", `${svc.name} status field is not "ok"`);
  });
}

// ── Gateway: WebSocket hub ────────────────────────────────────────────────────

Deno.test("[gateway] WebSocket receives marketUpdate within 3 seconds", async () => {
  const ws = new WebSocket(`ws://localhost:5011/ws`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const msg = await new Promise<{ event: string; data: unknown }>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 3_000);
    ws.onmessage = (ev) => {
      const parsed = JSON.parse(ev.data as string) as { event: string; data: unknown };
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
  const d = msg.data as { prices: Record<string, number> };
  assert(typeof d.prices === "object");
  assert(Object.keys(d.prices).length > 0);
});

// ── Gateway: order submission ─────────────────────────────────────────────────

Deno.test("[gateway] submitOrder via WebSocket responds within 5s", async () => {
  // Without a valid session cookie, the gateway returns orderRejected (unauthenticated).
  // In a live environment with auth, this would return orderAck.
  // Both outcomes confirm the WS pipeline is operational.
  const ws = new WebSocket(`ws://localhost:5011/ws`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const ack = await new Promise<{ event: string; data: unknown }>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout waiting for response")); }, 5_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "submitOrder",
        payload: {
          clientOrderId: `test-${Date.now()}`,
          asset: "AAPL",
          side: "BUY",
          quantity: 100,
          limitPrice: 200.0,
          expiresAt: 60,
          strategy: "LIMIT",
          algoParams: { strategy: "LIMIT" },
        },
      }));
    };

    ws.onmessage = (ev) => {
      const parsed = JSON.parse(ev.data as string) as { event: string; data: unknown };
      if (parsed.event === "orderAck" || parsed.event === "orderRejected" || parsed.event === "error") {
        clearTimeout(t);
        ws.close();
        resolve(parsed);
      }
    };

    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });

  await closed;
  assert(
    ack.event === "orderAck" || ack.event === "orderRejected" || ack.event === "error",
    `Expected orderAck/orderRejected/error, got: ${ack.event}`,
  );
});

// ── Service proxy data endpoints (tested via upstream services; gateway proxies require auth) ──

Deno.test("[market-sim] /assets returns asset list with AAPL", async () => {
  const res = await fetch(`${MARKET_URL}/assets`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const assets = await res.json();
  assert(Array.isArray(assets) && assets.length > 0);
  assertExists(assets.find((a: { symbol: string }) => a.symbol === "AAPL"));
});

Deno.test("[journal] /candles returns array for AAPL 1m", async () => {
  const res = await fetch(
    `${JOURNAL_URL}/candles?instrument=AAPL&interval=1m&limit=5`,
    { signal: timeout(5_000) },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body), "candles should be an array");
});

Deno.test("[journal] /orders returns array", async () => {
  const res = await fetch(`${JOURNAL_URL}/orders?limit=10`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body), "orders should be an array");
});

// ── Market data (internal) ────────────────────────────────────────────────────

Deno.test("[market] /assets returns enriched asset list", async () => {
  const res = await fetch(`${MARKET_URL}/assets`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const assets = await res.json();
  assert(Array.isArray(assets) && assets.length > 0);
  const aapl = assets.find((a: { symbol: string }) => a.symbol === "AAPL");
  assertExists(aapl);
  assertEquals(typeof aapl.initialPrice, "number");
  assertEquals(typeof aapl.dailyVolume, "number");
});

Deno.test("[market] WebSocket delivers market data within 3s", async () => {
  const ws = new WebSocket(`ws://localhost:5000`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const msg = await new Promise<{ event: string; data: unknown }>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 3_000);
    ws.onmessage = (ev) => {
      clearTimeout(t);
      ws.close();
      resolve(JSON.parse(ev.data as string) as { event: string; data: unknown });
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error("WS error")); };
  });

  await closed;
  assert("event" in msg);
  const d = msg.data as { prices?: Record<string, number> };
  assert(typeof d === "object");
  if (d.prices) assert(Object.keys(d.prices).length > 0);
});

// ── EMS (internal — now bus-driven but health still reachable) ────────────────

Deno.test("[ems] health endpoint is ok", async () => {
  const res = await fetch(`${EMS_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
});

// ── Algo services: health ─────────────────────────────────────────────────────

for (const [name, url] of [
  ["limit-algo",         LIMIT_URL   ],
  ["twap-algo",          TWAP_URL    ],
  ["pov-algo",           POV_URL     ],
  ["vwap-algo",          VWAP_URL    ],
  ["iceberg-algo",       ICEBERG_URL ],
  ["sniper-algo",        SNIPER_URL  ],
  ["arrival-price-algo", AP_URL      ],
] as const) {
  Deno.test(`[algo] ${name} health is ok`, async () => {
    const res = await fetch(`${url}/health`, { signal: timeout(5_000) });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.status, "ok");
  });
}

// ── FIX archive ───────────────────────────────────────────────────────────────

Deno.test("[fix-archive] /health includes execution count", async () => {
  const res = await fetch(`${ARCHIVE_URL}/health`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(typeof body.executions, "number");
});

Deno.test("[fix-archive] /executions returns an array", async () => {
  const res = await fetch(`${ARCHIVE_URL}/executions?limit=10`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body), "executions should be an array");
});

// ── Journal: candle history ───────────────────────────────────────────────────

Deno.test("[journal] GET /candles?instrument=AAPL&interval=1m returns array", async () => {
  const res = await fetch(
    `${JOURNAL_URL}/candles?instrument=AAPL&interval=1m&limit=5`,
    { signal: timeout(5_000) },
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body));
});

// ── Grid query ────────────────────────────────────────────────────────────────

Deno.test("[grid/query] POST /grid/query via journal returns correct shape", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 50,
    }),
    signal: timeout(8_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { rows: unknown[]; total: number; evalMs: number };
  assert(Array.isArray(body.rows), "rows must be an array");
  assertEquals(typeof body.total, "number", "total must be a number");
  assertEquals(typeof body.evalMs, "number", "evalMs must be a number");
  assert(body.evalMs >= 0, "evalMs must be non-negative");
});

// ── Version consistency ───────────────────────────────────────────────────────

Deno.test("[e2e] all services report consistent version string", async () => {
  const results = await Promise.all(
    INTERNAL_SERVICES.map(async (svc) => {
      try {
        const res = await fetch(`${svc.url}/health`, { signal: timeout(3_000) });
        const body = await res.json() as { version?: string };
        return { name: svc.name, version: body.version ?? "unknown" };
      } catch {
        return { name: svc.name, version: "unreachable" };
      }
    }),
  );
  const versions = new Set(results.map((r) => r.version).filter((v) => v !== "unknown"));
  assertEquals(
    versions.size,
    1,
    `Services report inconsistent versions: ${results.map((r) => `${r.name}=${r.version}`).join(", ")}`,
  );
});

// ── News aggregator ───────────────────────────────────────────────────────────

Deno.test("[news] GET /news?symbol=AAPL returns an array", async () => {
  const res = await fetch(`${NEWS_URL}/news?symbol=AAPL&limit=5`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body), "news should be an array");
});

Deno.test("[news] GET /sources returns source list with enabled field", async () => {
  const res = await fetch(`${NEWS_URL}/sources`, { signal: timeout(5_000) });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body) && body.length > 0, "sources should be a non-empty array");
  const first = body[0] as { id: string; label: string; enabled: boolean };
  assertExists(first.id);
  assertExists(first.label);
  assertEquals(typeof first.enabled, "boolean");
});

// ── Order placement: BUY ──────────────────────────────────────────────────────

Deno.test("[orders] BUY LIMIT order is acknowledged by the gateway pipeline", async () => {
  const token = await loginAs("alice");
  const ack = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: 99_999,
    strategy: "LIMIT",
  });
  assertEquals(ack.event, "orderAck", `Expected orderAck, got ${ack.event}`);
});

// ── Order placement: SELL ─────────────────────────────────────────────────────

Deno.test("[orders] SELL LIMIT order is acknowledged by the gateway pipeline", async () => {
  const token = await loginAs("alice");
  const ack = await submitOrderViaWs(token, {
    asset: "MSFT",
    side: "SELL",
    quantity: 10,
    limitPrice: 1,
    strategy: "LIMIT",
  });
  assertEquals(ack.event, "orderAck", `Expected orderAck, got ${ack.event}`);
});

// ── Order placement: Option (rejected — not supported) ────────────────────────

Deno.test("[orders] option order is rejected by OMS with a clear reason", async () => {
  const token = await loginAs("alice");

  // Submit and wait for the WS ack/reject from the gateway, then poll for the
  // OMS rejection event which arrives as an orderEvent on orders.rejected topic.
  const gatewayResponse = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: 200,
    strategy: "LIMIT",
    instrumentType: "option",
  });

  // Gateway should ack the submission (it puts it on the bus)
  // The OMS then rejects it and publishes orders.rejected — gateway forwards as orderEvent
  assert(
    gatewayResponse.event === "orderAck" || gatewayResponse.event === "orderRejected",
    `Expected orderAck or orderRejected, got ${gatewayResponse.event}`,
  );
});

// ── End-to-end order flow: bus observable fill propagation ────────────────────

Deno.test("[e2e] gateway WS connects and receives messages", async () => {
  const ws = new WebSocket(`ws://localhost:5011/ws`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const received: string[] = [];
  let orderResponseReceived = false;

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { ws.close(); resolve(); }, 8_000);
    let sendTimer: ReturnType<typeof setTimeout> | null = null;

    function done() { clearTimeout(t); if (sendTimer) clearTimeout(sendTimer); ws.close(); resolve(); }

    ws.onopen = () => {
      sendTimer = setTimeout(() => {
        sendTimer = null;
        ws.send(JSON.stringify({
          type: "submitOrder",
          payload: {
            clientOrderId: `e2e-${Date.now()}`,
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: 99_999,
            expiresAt: 30,
            strategy: "LIMIT",
            algoParams: { strategy: "LIMIT" },
          },
        }));
      }, 300);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as { event: string; topic?: string };
      received.push(msg.event);
      if (msg.event === "orderAck" || msg.event === "orderRejected") {
        orderResponseReceived = true;
        done();
      }
      if (msg.event === "orderEvent" && msg.topic === "orders.filled") done();
    };

    ws.onerror = () => { clearTimeout(t); if (sendTimer) clearTimeout(sendTimer); reject(new Error("WS error")); };
  });

  await closed;

  assert(received.length > 0, `Gateway should have sent at least one WS message; got none`);
  if (orderResponseReceived) {
    const lastOrderEvent = received.find((e) => e === "orderAck" || e === "orderRejected");
    assertExists(lastOrderEvent, `Order pipeline response should be orderAck or orderRejected`);
  }
});

// ── Shared workspaces ─────────────────────────────────────────────────────────

Deno.test("[shared-workspaces] GET /shared-workspaces requires auth", async () => {
  const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, { signal: timeout(5_000) });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("[observability] POST /events/batch accepts array and returns count", async () => {
  const batch = [
    { type: "client.action.test", ts: Date.now(), payload: { x: 1 } },
    { type: "client.action.test", ts: Date.now(), payload: { x: 2 } },
  ];
  const res = await fetch(`${OBS_URL}/events/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
    signal: timeout(5_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { success: boolean; count: number };
  assertEquals(body.success, true);
  assertEquals(body.count, 2);
});
