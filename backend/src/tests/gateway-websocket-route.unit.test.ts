import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { AuthResult, GatewayContext } from "../gateway/context.ts";

interface FakeSocket {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => Promise<void>;
  onclose?: () => void;
  onerror?: () => void;
}

const sockets: FakeSocket[] = [];

vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  upgradeWebSocket: () => {
    const socket: FakeSocket = { send: vi.fn(), close: vi.fn() };
    sockets.push(socket);
    return { socket, response: new Response(null, { status: 200 }) };
  },
}));

const connections = vi.hoisted(() => ({
  addAnonymousSocket: vi.fn(),
  addUserSocket: vi.fn(),
  broadcastAll: vi.fn(),
  removeSocket: vi.fn(),
  totalConnections: vi.fn(() => 1),
}));
vi.mock("../gateway/connections.ts", () => connections);

type RouteModule = typeof import("../gateway/routes/websocket.ts");

function authFor(role: string, id = "u-1"): AuthResult {
  return {
    user: { id, name: "T", role, avatar_emoji: "x" },
    limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
  };
}

interface Harness {
  route: RouteModule;
  events: Array<Record<string, unknown>>;
  sent: Array<{ topic: string; payload: Record<string, unknown> }>;
  ctx: GatewayContext;
  producerReady: { value: boolean };
  guestAllowed: { value: boolean };
  guestRetryMs: { value: number };
}

async function harness(env: Record<string, string> = {}): Promise<Harness> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const route = await import("../gateway/routes/websocket.ts");
  const events: Array<Record<string, unknown>> = [];
  const sent: Harness["sent"] = [];
  const producerReady = { value: true };
  const guestAllowed = { value: true };
  const guestRetryMs = { value: 4500 };
  const ctx = {
    publishAccessEvent: (e: Record<string, unknown>) => events.push(e),
    publicGuestTradingEnabled: true,
    producer: {
      isReady: () => producerReady.value,
      send: (topic: string, payload: Record<string, unknown>) => {
        sent.push({ topic, payload });
        return Promise.resolve();
      },
    },
    guestSubmitLimiter: {
      consume: () => ({ allowed: guestAllowed.value, retryAfterMs: guestRetryMs.value }),
    },
  } as unknown as GatewayContext;
  return { route, events, sent, ctx, producerReady, guestAllowed, guestRetryMs };
}

function upgradeRequest(cookie?: string, headers: Record<string, string> = {}) {
  return new Request("http://gw/ws", {
    headers: { upgrade: "websocket", ...(cookie ? { cookie } : {}), ...headers },
  });
}

async function connect(
  h: Harness,
  validate: (token: string) => Promise<AuthResult | null>,
  cookie?: string,
): Promise<FakeSocket> {
  const res = await h.route.handleWebSocketRoute(upgradeRequest(cookie), "/ws", h.ctx, {
    validateToken: validate,
  });
  assertEquals(res?.status, 200);
  const socket = sockets[sockets.length - 1];
  socket.onopen?.();
  return socket;
}

async function message(socket: FakeSocket, type: string, payload: Record<string, unknown> = {}) {
  assert(socket.onmessage);
  await socket.onmessage({ data: JSON.stringify({ type, payload }) });
}

function lastSent(socket: FakeSocket): Record<string, unknown> {
  const calls = socket.send.mock.calls;
  return JSON.parse(calls[calls.length - 1][0]);
}

beforeEach(() => {
  sockets.length = 0;
  for (const fn of Object.values(connections)) fn.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("[ws-route] ignores other paths and demands an upgrade header", async () => {
  const h = await harness();
  const deps = { validateToken: () => Promise.resolve(null) };
  assertEquals(
    await h.route.handleWebSocketRoute(new Request("http://gw/x"), "/x", h.ctx, deps),
    null,
  );
  const res = await h.route.handleWebSocketRoute(new Request("http://gw/ws"), "/ws", h.ctx, deps);
  assertEquals(res?.status, 426);
});

test("[ws-route] anonymous connections are tracked and announced", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(null));
  assertEquals(connections.addAnonymousSocket.mock.calls.length, 1);
  assertEquals(socket.send.mock.calls.length, 0);
  assertEquals(h.events[0].action, "ws_connect");
});

test("[ws-route] authenticated connections receive their identity on open", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=tok");
  assertEquals(connections.addUserSocket.mock.calls[0].slice(0, 1), ["u-1"]);
  assertEquals(lastSent(socket).event, "authIdentity");
  assertEquals(h.events[0], { action: "ws_connect", userId: "u-1", userRole: "trader" });
});

test("[ws-route] authenticate swaps the socket to the new identity or rejects the token", async () => {
  const h = await harness();
  const validate = (t: string) => Promise.resolve(t === "good" ? authFor("admin", "u-2") : null);
  const socket = await connect(h, validate);

  await message(socket, "authenticate", { token: "bad" });
  assertEquals(lastSent(socket).event, "authError");
  await message(socket, "authenticate", {});
  assertEquals(lastSent(socket).event, "authError");

  await message(socket, "authenticate", { token: "good" });
  assertEquals(lastSent(socket).event, "authIdentity");
  assertEquals(connections.addUserSocket.mock.calls[0].slice(0, 1), ["u-2"]);
  assertEquals(connections.removeSocket.mock.calls.length, 1);
});

test("[ws-route] malformed frames produce an error event", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(null));
  assert(socket.onmessage);
  await socket.onmessage({ data: "not json" });
  assertEquals(lastSent(socket).event, "error");
});

test("[ws-route] submitOrder rejects unauthenticated sessions", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(null));
  await message(socket, "submitOrder", { clientOrderId: "c-1" });
  const out = lastSent(socket) as { event: string; data: { clientOrderId: string } };
  assertEquals(out.event, "orderRejected");
  assertEquals(out.data.clientOrderId, "c-1");
  assertEquals(h.sent.length, 0);
});

test("[ws-route] submitOrder is limited to traders and enabled guests", async () => {
  const h = await harness();
  const viewer = await connect(h, () => Promise.resolve(authFor("viewer")), "veta_user=t");
  await message(viewer, "submitOrder", { clientOrderId: "c-1" });
  assertEquals(lastSent(viewer).event, "orderRejected");

  h.ctx.publicGuestTradingEnabled = false;
  const guest = await connect(h, () => Promise.resolve(authFor("guest")), "veta_user=t");
  await message(guest, "submitOrder", {});
  assertEquals(lastSent(guest).event, "orderRejected");
  assertEquals(h.sent.length, 0);
});

test("[ws-route] a trader's order is published with their identity and acknowledged", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");
  await message(socket, "submitOrder", { clientOrderId: "c-1", symbol: "AAPL" });

  assertEquals(h.sent[0].topic, "orders.new");
  assertEquals(h.sent[0].payload, {
    clientOrderId: "c-1",
    symbol: "AAPL",
    userId: "u-1",
    userRole: "trader",
  });
  assertEquals(lastSent(socket).event, "orderAck");
  const submitted = h.events.find((e) => e.action === "order_submitted");
  assertEquals(submitted?.orderId, "c-1");
});

test("[ws-route] submitOrder reports an unavailable bus", async () => {
  const h = await harness();
  h.producerReady.value = false;
  const socket = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");
  await message(socket, "submitOrder", {});
  assertEquals(lastSent(socket).event, "error");
  assertEquals(h.sent.length, 0);
});

test("[ws-route] guest orders pass through the per-IP rate limiter", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(authFor("guest")), "veta_user=t");

  h.guestAllowed.value = false;
  await message(socket, "submitOrder", { clientOrderId: "g-1" });
  const limited = lastSent(socket) as { event: string; data: { retryAfterMs: number } };
  assertEquals(limited.event, "orderRejected");
  assertEquals(limited.data.retryAfterMs, 4500);
  assertEquals(h.sent.length, 0);

  h.guestAllowed.value = true;
  await message(socket, "submitOrder", { orderId: "g-2" });
  assertEquals(lastSent(socket).event, "orderAck");
  assertEquals(h.sent.length, 1);
});

test("[ws-route] killOrders requires an authenticated admin or trader and a live bus", async () => {
  const h = await harness();
  const anon = await connect(h, () => Promise.resolve(null));
  await message(anon, "killOrders");
  assertEquals(lastSent(anon).event, "error");

  const viewer = await connect(h, () => Promise.resolve(authFor("viewer")), "veta_user=t");
  await message(viewer, "killOrders");
  assertEquals(
    (lastSent(viewer) as { data: { message: string } }).data.message.includes("admin"),
    true,
  );

  const trader = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");
  h.producerReady.value = false;
  await message(trader, "killOrders");
  assertEquals((lastSent(trader) as { data: { message: string } }).data.message, "Bus unavailable");
  assertEquals(h.sent.length, 0);

  h.producerReady.value = true;
  await message(trader, "killOrders", { scope: "symbol", scopeValue: "AAPL" });
  assertEquals(h.sent[0].topic, "orders.kill");
  assertEquals(h.sent[0].payload.issuedBy, "u-1");
  assertEquals(lastSent(trader).event, "killAck");
  const killed = h.events.find((e) => e.action === "orders_kill");
  assertEquals(killed?.scope, "symbol");
  assertEquals(killed?.scopeValue, "AAPL");
});

test("[ws-route] resumeOrders is admin only", async () => {
  const h = await harness();
  const anon = await connect(h, () => Promise.resolve(null));
  await message(anon, "resumeOrders");
  assertEquals(lastSent(anon).event, "error");

  const trader = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");
  await message(trader, "resumeOrders");
  assertEquals(
    (lastSent(trader) as { data: { message: string } }).data.message,
    "Resume requires admin role",
  );

  const admin = await connect(h, () => Promise.resolve(authFor("admin", "u-9")), "veta_user=t");
  h.producerReady.value = false;
  await message(admin, "resumeOrders");
  assertEquals((lastSent(admin) as { data: { message: string } }).data.message, "Bus unavailable");

  h.producerReady.value = true;
  await message(admin, "resumeOrders", { scope: "all" });
  assertEquals(h.sent[0].topic, "orders.resume");
  assertEquals(h.sent[0].payload.issuedBy, "u-9");
  assertEquals(lastSent(admin).event, "resumeAck");
});

test("[ws-route] cancel, hold and unhold publish one command per order and broadcast", async () => {
  const h = await harness();
  const trader = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");

  const cases: Array<[string, string, string]> = [
    ["cancelOrders", "orders.cancelled", "cancelAck"],
    ["holdOrders", "orders.held", "holdAck"],
    ["unholdOrders", "orders.unhold", "unholdAck"],
  ];
  for (const [type, topic, ack] of cases) {
    h.sent.length = 0;
    await message(trader, type, { orderIds: ["o-1", "o-2"] });
    assertEquals(
      h.sent.map((s) => [s.topic, s.payload.clientOrderId]),
      [
        [topic, "o-1"],
        [topic, "o-2"],
      ],
    );
    assertEquals(lastSent(trader).event, ack);
  }
  assertEquals(connections.broadcastAll.mock.calls.length, 3);

  h.sent.length = 0;
  await message(trader, "cancelOrders");
  assertEquals(h.sent.length, 0);
  assertEquals(lastSent(trader).event, "cancelAck");
});

test("[ws-route] order management rejects anonymous users, unsuitable roles and a down bus", async () => {
  const h = await harness();
  const anon = await connect(h, () => Promise.resolve(null));
  await message(anon, "cancelOrders", { orderIds: ["o-1"] });
  assertEquals((lastSent(anon) as { data: { message: string } }).data.message, "Unauthenticated");

  const viewer = await connect(h, () => Promise.resolve(authFor("viewer")), "veta_user=t");
  await message(viewer, "holdOrders", { orderIds: ["o-1"] });
  assertEquals(
    (lastSent(viewer) as { data: { message: string } }).data.message,
    "viewer cannot manage orders",
  );

  const trader = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");
  h.producerReady.value = false;
  await message(trader, "unholdOrders", { orderIds: ["o-1"] });
  assertEquals((lastSent(trader) as { data: { message: string } }).data.message, "Bus unavailable");
  assertEquals(h.sent.length, 0);
});

test("[ws-route] revalidates the cookie token when the session had no identity at upgrade", async () => {
  const h = await harness();
  let calls = 0;
  const validate = () => {
    calls += 1;
    return Promise.resolve(calls === 1 ? null : authFor("trader"));
  };
  const socket = await connect(h, validate, "veta_user=t");
  await message(socket, "submitOrder", { clientOrderId: "c-1" });
  assertEquals(lastSent(socket).event, "orderAck");
  assertEquals(calls, 2);
});

test("[ws-route] close and error handlers release the socket", async () => {
  const h = await harness();
  const socket = await connect(h, () => Promise.resolve(authFor("trader")), "veta_user=t");
  socket.onerror?.();
  assertEquals(socket.close.mock.calls.length, 1);
  socket.onclose?.();
  assertEquals(connections.removeSocket.mock.calls[0][0], "u-1");
});

test("[ws-route] a flood of frames is rate limited, then the socket is closed for abuse", async () => {
  const h = await harness({ WS_FRAME_CAPACITY: "1", WS_FRAME_REFILL_PER_SECOND: "0.0001" });
  const socket = await connect(h, () => Promise.resolve(null));
  for (let i = 0; i < 11; i++) await message(socket, "noop");

  const events = socket.send.mock.calls.map((c) => JSON.parse(c[0]).event);
  assertEquals(events.filter((e: string) => e === "rateLimited").length, 10);
  assertEquals(events[events.length - 1], "disconnectedAbuse");
  assertEquals(socket.close.mock.calls[0][0], 1008);
  assert(h.events.some((e) => e.action === "ws_rate_limited"));
  assert(h.events.some((e) => e.action === "ws_disconnected_abuse"));
});

test("[ws-route] repeated abuse blocks new upgrades with a retry hint", async () => {
  const h = await harness({ WS_FRAME_CAPACITY: "1", WS_FRAME_REFILL_PER_SECOND: "0.0001" });
  for (let round = 0; round < 3; round++) {
    const socket = await connect(h, () => Promise.resolve(null));
    for (let i = 0; i < 11; i++) await message(socket, "noop");
  }
  const res = await h.route.handleWebSocketRoute(upgradeRequest(), "/ws", h.ctx, {
    validateToken: () => Promise.resolve(null),
  });
  assertEquals(res?.status, 429);
  assert(Number(res?.headers.get("Retry-After")) >= 1);
  const body = await res?.json();
  assertEquals(body.error, "user_backoff");
  assert(h.events.some((e) => e.action === "ws_blocked"));
});
