/**
 * Integration tests — require backend services to be running.
 *
 * Tests key internal service endpoints.
 * Note: Order submission via HTTP to OMS/algo services is no longer
 * the primary path — orders flow via gateway WS → bus → OMS → algos.
 * These tests verify that internal health endpoints and bus-adjacent
 * behaviour are correct.
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

const GATEWAY_URL   = "http://localhost:5011";
const MARKET_URL    = "http://localhost:5000";
const JOURNAL_URL   = "http://localhost:5009";
const OMS_URL       = "http://localhost:5002";
const LIMIT_URL     = "http://localhost:5003";
const TWAP_URL      = "http://localhost:5004";
const POV_URL       = "http://localhost:5005";
const VWAP_URL      = "http://localhost:5006";
const ARCHIVE_URL   = "http://localhost:5012";
const USER_SVC_URL  = "http://localhost:5008";

function t(ms = 5_000) { return AbortSignal.timeout(ms); }

/** Log in as the given user and return the Set-Cookie header value. */
async function loginAs(userId: string): Promise<string> {
  const res = await fetch(`${USER_SVC_URL}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
    signal: t(),
  });
  assertEquals(res.status, 200, `Login as ${userId} failed`);
  await res.body?.cancel();
  const cookie = res.headers.get("set-cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  assert(match, `No veta_user cookie in login response for ${userId}`);
  return `veta_user=${match[1]}`;
}

// ── OPTIONS preflight (CORS) ──────────────────────────────────────────────────

Deno.test("[cors] OMS OPTIONS returns 204", async () => {
  const res = await fetch(OMS_URL, { method: "OPTIONS", signal: t() });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("[cors] gateway OPTIONS returns 204", async () => {
  const res = await fetch(GATEWAY_URL, { method: "OPTIONS", signal: t() });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

// ── Gateway proxy endpoints ───────────────────────────────────────────────────
// Note: /assets, /candles, /orders require auth via the gateway.
// We test the upstream services directly to verify data availability.

Deno.test("[market-sim] /assets returns asset list with AAPL", async () => {
  const res = await fetch(`${MARKET_URL}/assets`, { signal: t() });
  assertEquals(res.status, 200);
  const assets = await res.json() as { symbol: string }[];
  assert(Array.isArray(assets) && assets.length > 0);
  assertExists(assets.find((a) => a.symbol === "AAPL"));
});

Deno.test("[journal] /candles returns array", async () => {
  const res = await fetch(`${JOURNAL_URL}/candles?instrument=AAPL&interval=1m&limit=5`, { signal: t() });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()));
});

Deno.test("[journal] /orders returns array", async () => {
  const res = await fetch(`${JOURNAL_URL}/orders?limit=5`, { signal: t() });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()));
});

// ── Market data ───────────────────────────────────────────────────────────────

Deno.test("[market] /assets returns enriched fields", async () => {
  const res = await fetch(`${MARKET_URL}/assets`, { signal: t() });
  assertEquals(res.status, 200);
  const assets = await res.json() as { symbol: string; initialPrice: number; dailyVolume: number }[];
  assert(assets.length > 0);
  const aapl = assets.find((a) => a.symbol === "AAPL");
  assertExists(aapl);
  assert(aapl.dailyVolume > 0);
  assert(aapl.initialPrice > 0);
});

// ── Algo health: pending/active counts ───────────────────────────────────────

Deno.test("[limit-algo] health includes pending count", async () => {
  const res = await fetch(`${LIMIT_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; pending: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.pending, "number");
});

Deno.test("[pov-algo] health includes activeOrders count", async () => {
  const res = await fetch(`${POV_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; activeOrders: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.activeOrders, "number");
});

Deno.test("[vwap-algo] health includes activeOrders count", async () => {
  const res = await fetch(`${VWAP_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; activeOrders: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.activeOrders, "number");
});

Deno.test("[twap-algo] health is ok", async () => {
  const res = await fetch(`${TWAP_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  assertEquals((await res.json() as { status: string }).status, "ok");
});

// ── FIX Archive ───────────────────────────────────────────────────────────────

Deno.test("[fix-archive] /executions?symbol=AAPL returns filtered array", async () => {
  const res = await fetch(`${ARCHIVE_URL}/executions?symbol=AAPL&limit=5`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body));
});

Deno.test("[fix-archive] /executions/:nonexistent returns 404", async () => {
  const res = await fetch(`${ARCHIVE_URL}/executions/NONEXISTENT-EXEC`, { signal: t() });
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

// ── Gateway: order submission via WebSocket ───────────────────────────────────

Deno.test("[gateway] WS connects and responds to submitOrder within 5s", async () => {
  // Gateway requires a valid session cookie to submit orders.
  // In CI without a live user-service session, the gateway returns an
  // error event rather than orderAck — both confirm the WS message pipeline works.
  const ws = new WebSocket(`ws://localhost:5011/ws`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const result = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 5_000);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "submitOrder",
        payload: {
          clientOrderId: `int-${Date.now()}`,
          asset: "MSFT",
          side: "BUY",
          quantity: 25,
          limitPrice: 420.0,
          expiresAt: 30,
          strategy: "LIMIT",
          algoParams: { strategy: "LIMIT" },
        },
      }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as { event: string };
      // orderAck = authenticated success, orderRejected = unauthenticated, error = bus down
      if (msg.event === "orderAck" || msg.event === "orderRejected" || msg.event === "error") {
        clearTimeout(timer);
        ws.close();
        resolve(msg.event);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WS error")); };
  });

  await closed;
  // orderAck (auth), orderRejected (no session in CI), error (bus issue). All confirm pipeline responds.
  assert(
    result === "orderAck" || result === "orderRejected" || result === "error",
    `unexpected event: ${result}`,
  );
});

// ── OMS: health only (no longer accepts HTTP order submission) ────────────────

Deno.test("[oms] health is ok", async () => {
  const res = await fetch(`${OMS_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  assertEquals((await res.json() as { status: string }).status, "ok");
});

Deno.test("[oms] POST / returns 404 (order submission moved to bus)", async () => {
  const res = await fetch(OMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 150 }),
    signal: t(),
  });
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

// ── Grid query endpoint ───────────────────────────────────────────────────────

const EMPTY_FILTER_EXPR = { kind: "group", id: "root", join: "AND", rules: [] };

Deno.test("[grid/query] POST /grid/query without auth returns 401", async () => {
  const res = await fetch(`${GATEWAY_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: EMPTY_FILTER_EXPR,
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 50,
    }),
    signal: t(),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("[grid/query] POST /grid/query with malformed body returns 400", async () => {
  // Direct to journal (bypassing gateway auth for this structural test)
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notAValidRequest: true }),
    signal: t(),
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test("[grid/query] POST /grid/query direct to journal returns correct shape", async () => {
  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: EMPTY_FILTER_EXPR,
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 50,
    }),
    signal: t(8_000),
  });
  assertEquals(res.status, 200);
  const body = await res.json() as { rows: unknown[]; total: number; evalMs: number };
  assert(Array.isArray(body.rows), "rows should be an array");
  assertEquals(typeof body.total, "number");
  assertEquals(typeof body.evalMs, "number");
  assert(body.evalMs >= 0, "evalMs should be non-negative");
  assert(body.total >= 0, "total should be non-negative");
});

// ── Shared workspaces ─────────────────────────────────────────────────────────

Deno.test("[shared-workspaces] GET /shared-workspaces without auth returns 401", async () => {
  const res = await fetch(`${GATEWAY_URL}/shared-workspaces`, { signal: t() });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("[shared-workspaces] full lifecycle: POST → GET → DELETE", async () => {
  const aliceCookie = await loginAs("alice");
  const bobCookie   = await loginAs("bob");

  // Alice publishes a workspace
  const model = { global: {}, layout: { type: "row", children: [] } };
  const postRes = await fetch(`${GATEWAY_URL}/shared-workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: aliceCookie },
    body: JSON.stringify({ name: "Test Workspace", model }),
    signal: t(),
  });
  assertEquals(postRes.status, 200);
  const { id } = await postRes.json() as { id: string };
  assertExists(id);

  // GET lists it (Bob can see it)
  const listRes = await fetch(`${GATEWAY_URL}/shared-workspaces`, {
    headers: { cookie: bobCookie },
    signal: t(),
  });
  assertEquals(listRes.status, 200);
  const list = await listRes.json() as { id: string; name: string; ownerName: string }[];
  const found = list.find((e) => e.id === id);
  assertExists(found, "Published workspace should appear in list");
  assertEquals(found.name, "Test Workspace");
  assertEquals(found.ownerName, "Alice Chen");

  // Bob cannot delete Alice's workspace
  const bobDeleteRes = await fetch(`${GATEWAY_URL}/shared-workspaces/${id}`, {
    method: "DELETE",
    headers: { cookie: bobCookie },
    signal: t(),
  });
  assertEquals(bobDeleteRes.status, 403);
  await bobDeleteRes.body?.cancel();

  // Alice deletes her own workspace
  const deleteRes = await fetch(`${GATEWAY_URL}/shared-workspaces/${id}`, {
    method: "DELETE",
    headers: { cookie: aliceCookie },
    signal: t(),
  });
  assertEquals(deleteRes.status, 200);
  await deleteRes.body?.cancel();

  // No longer in list
  const afterRes = await fetch(`${GATEWAY_URL}/shared-workspaces`, {
    headers: { cookie: aliceCookie },
    signal: t(),
  });
  const afterList = await afterRes.json() as { id: string }[];
  assert(!afterList.find((e) => e.id === id), "Deleted workspace should not appear in list");
});

Deno.test("[shared-workspaces] GET /:id returns model JSON", async () => {
  const aliceCookie = await loginAs("alice");
  const model = { global: {}, layout: { type: "row", children: [] } };

  const postRes = await fetch(`${GATEWAY_URL}/shared-workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: aliceCookie },
    body: JSON.stringify({ name: "Detail Test", model }),
    signal: t(),
  });
  const { id } = await postRes.json() as { id: string };

  const detailRes = await fetch(`${GATEWAY_URL}/shared-workspaces/${id}`, {
    headers: { cookie: aliceCookie },
    signal: t(),
  });
  assertEquals(detailRes.status, 200);
  const detail = await detailRes.json() as { id: string; model: unknown; name: string };
  assertEquals(detail.id, id);
  assertEquals(detail.name, "Detail Test");
  assertExists(detail.model);

  // Cleanup
  await fetch(`${GATEWAY_URL}/shared-workspaces/${id}`, {
    method: "DELETE",
    headers: { cookie: aliceCookie },
    signal: t(),
  });
});
