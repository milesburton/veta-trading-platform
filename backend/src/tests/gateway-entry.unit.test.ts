import { afterAll, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Promise<Response>;
type MessageHandler = (topic: string, value: unknown) => void;

const h = vi.hoisted(() => ({
  handler: undefined as undefined | ((req: Request) => Promise<Response>),
  consumers: new Map<string, (topic: string, value: unknown) => void>(),
  failingGroups: new Set<string>(),
  validateToken: vi.fn(),
  broadcastAll: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToRoles: vi.fn(),
  send: vi.fn(),
  isReady: vi.fn(),
  publishAudit: vi.fn(),
  proxyGet: vi.fn(),
  proxyPost: vi.fn(),
  proxyPut: vi.fn(),
  proxyWithWake: vi.fn(),
  serveDir: vi.fn(),
  pollServices: vi.fn(),
  routeResults: new Map<string, unknown>(),
  sockets: [] as Array<{
    url: string;
    close: ReturnType<typeof vi.fn>;
    onmessage?: (ev: { data: string }) => void;
    onclose?: () => void;
    onerror?: () => void;
  }>,
}));

const routeNames = [
  "ws",
  "proxied",
  "alerts",
  "analytics",
  "admin",
  "logs",
  "telemetry",
  "bugReport",
  "ticketAttachments",
  "loadgenAnnounce",
  "scenarios",
] as const;

const routeMock = (name: (typeof routeNames)[number]) =>
  vi.fn(() => Promise.resolve(h.routeResults.get(name) ?? null));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () => Promise.resolve({ send: h.send, isReady: h.isReady }),
  createConsumer: (group: string) =>
    h.failingGroups.has(group)
      ? Promise.reject(new Error("consumer unavailable"))
      : Promise.resolve({
          onMessage: (fn: MessageHandler) => {
            h.consumers.set(group, fn);
          },
        }),
}));
vi.mock("../notifications/ticketing.ts", () => ({
  startTicketingHealthMonitor: vi.fn(),
  getTicketingHealth: () => ({ ok: true }),
}));
vi.mock("../notifications/discord-notifier.ts", () => ({
  notifyOperators: vi.fn(),
  sendDailySummary: vi.fn(),
}));
vi.mock("../gateway/daily-summary.ts", () => ({ startDailySummary: vi.fn() }));
vi.mock("../gateway/connections.ts", () => ({
  broadcastAll: h.broadcastAll,
  broadcastToUser: h.broadcastToUser,
  broadcastToRoles: h.broadcastToRoles,
}));
vi.mock("../gateway/auth.ts", () => ({ makeValidateToken: () => h.validateToken }));
vi.mock("../gateway/load-agent.ts", () => ({ LoadAgent: class {} }));
vi.mock("../gateway/ref-prices.ts", () => ({
  createRefPriceCache: () => ({ refPriceFor: vi.fn() }),
}));
vi.mock("../gateway/privileged-audit.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  makeAuditPublisher: () => h.publishAudit,
}));
vi.mock("../gateway/proxy.ts", () => ({
  LONG_POST_TIMEOUT_MS: 300_000,
  proxyGet: h.proxyGet,
  proxyPost: h.proxyPost,
  proxyPut: h.proxyPut,
}));
vi.mock("../gateway/wake.ts", () => ({ proxyWithWake: h.proxyWithWake }));
vi.mock("../lib/static-files.ts", () => ({ serveDir: h.serveDir }));
vi.mock("../lib/s3.ts", () => ({ createS3Client: vi.fn(() => ({})) }));
vi.mock("../gateway/service-status.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  pollServices: h.pollServices,
}));
vi.mock("../gateway/system-status.ts", () => ({
  handleHealth: () => new Response('{"status":"ok"}'),
  handleSystemStatus: () => new Response('{"system":true}'),
  makeMarketSimWsProxy: () => new Response("proxied-ws"),
}));
vi.mock("../gateway/routes/websocket.ts", () => ({ handleWebSocketRoute: routeMock("ws") }));
vi.mock("../gateway/routes/proxied.ts", () => ({ handleProxiedRoutes: routeMock("proxied") }));
vi.mock("../gateway/routes/alerts.ts", () => ({ handleAlertsRoute: routeMock("alerts") }));
vi.mock("../gateway/routes/analytics.ts", () => ({
  handleAnalyticsRoute: routeMock("analytics"),
}));
vi.mock("../gateway/routes/admin.ts", () => ({ handleAdminRoute: routeMock("admin") }));
vi.mock("../gateway/routes/logs.ts", () => ({
  handleLogsRoute: routeMock("logs"),
  recordLogLine: vi.fn(),
}));
vi.mock("../gateway/routes/telemetry.ts", () => ({
  handleTelemetryRoute: routeMock("telemetry"),
}));
vi.mock("../gateway/routes/bug-report.ts", () => ({
  handleBugReportRoute: routeMock("bugReport"),
}));
vi.mock("../gateway/routes/ticket-attachments.ts", () => ({
  handleTicketAttachmentsRoute: routeMock("ticketAttachments"),
}));
vi.mock("../gateway/routes/loadgen-announce.ts", () => ({
  handleLoadgenAnnounceRoute: routeMock("loadgenAnnounce"),
}));
vi.mock("../gateway/routes/scenarios.ts", () => ({
  handleScenariosRoute: routeMock("scenarios"),
}));

const READY_IDS = ["marketSim", "ems", "oms", "journal", "userService", "kafkaRelay"];

const entries = (down: string[] = []) =>
  READY_IDS.map((id) => ({
    id,
    name: id,
    composeName: id,
    category: "core",
    tier: 0,
    optional: false,
    visible: true,
    status: down.includes(id) ? "error" : "ok",
    version: "1",
    meta: { secret: true },
    checkedAt: 1,
  }));

const fetchMock = vi.fn();

vi.stubEnv("CORS_ALLOWED_ORIGINS", "http://app.test");
vi.stubEnv("RATE_LIMIT_IP_CAPACITY", "1000");
vi.stubEnv("RATE_LIMIT_USER_CAPACITY", "1000");
vi.stubEnv("UPGRADE_IN_PROGRESS", "true");
vi.stubEnv("UPGRADE_MESSAGE", "maintenance");
vi.stubEnv("FRONTEND_DIST", "/dist");
vi.stubEnv("QUICK_TRADE_LLM_ENABLED", "true");
vi.stubEnv("DISCORD_DAILY_SUMMARY_HOUR_UTC", "99");
vi.stubEnv("MINIO_ENDPOINT", "http://minio");
vi.stubEnv("MINIO_ROOT_USER", "u");
vi.stubEnv("MINIO_ROOT_PASSWORD", "p");
vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal(
  "WebSocket",
  Object.assign(
    function FakeWebSocket(this: unknown, url: string) {
      const socket = { url, close: vi.fn() };
      h.sockets.push(socket);
      return socket;
    },
    { OPEN: 1 }
  )
);

h.pollServices.mockResolvedValue(entries());
h.isReady.mockReturnValue(true);
h.send.mockResolvedValue(undefined);
h.proxyGet.mockImplementation(() => Promise.resolve(new Response("get-ok")));
h.proxyPost.mockImplementation(() => Promise.resolve(new Response("post-ok", { status: 201 })));
h.proxyPut.mockImplementation(() => Promise.resolve(new Response("put-ok")));
h.proxyWithWake.mockImplementation((_name: string, call: () => Promise<Response>) => call());
fetchMock.mockImplementation(() =>
  Promise.resolve(
    new Response(JSON.stringify({ totalSymbols: 3, avgDays: 2, minDays: 1, queriedAt: 5 }), {
      headers: { "Content-Type": "application/json" },
    })
  )
);

vi.useFakeTimers();
await import("../gateway/gateway.ts");
await vi.waitFor(() => assert(h.consumers.size > 5));
await vi.waitFor(() => assert(h.handler));

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ADMIN = {
  user: { id: "admin-1", name: "A", role: "admin", avatar_emoji: "x" },
  limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
};
const TRADER = { ...ADMIN, user: { ...ADMIN.user, id: "t-1", role: "trader" } };

const call = (
  path: string,
  init: RequestInit & { cookie?: boolean; origin?: string } = {}
): Promise<Response> => {
  const { cookie = true, origin, headers, ...rest } = init;
  assert(h.handler);
  return h.handler(
    new Request(`http://gw${path}`, {
      ...rest,
      headers: {
        ...(cookie ? { cookie: "veta_user=tok" } : {}),
        ...(origin ? { origin } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    })
  );
};

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  h.validateToken.mockReset().mockResolvedValue(ADMIN);
  h.routeResults.clear();
  h.proxyGet.mockClear();
  h.proxyPost.mockClear();
  h.proxyPut.mockClear();
  h.serveDir.mockReset();
  h.publishAudit.mockClear();
  h.broadcastAll.mockClear();
  h.broadcastToUser.mockClear();
  h.broadcastToRoles.mockClear();
  h.send.mockClear();
});

test("[gateway] answers CORS preflight and the health route", async () => {
  const preflight = await call("/anything", { method: "OPTIONS", origin: "http://app.test" });
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get("access-control-allow-origin"), "http://app.test");
  assertEquals((await call("/health")).status, 200);
});

test("[gateway] /features requires a session and reports the quick-trade flag", async () => {
  assertEquals((await call("/features", { cookie: false })).status, 401);
  const res = await call("/features");
  assertEquals(await json(res), { quickTradeAi: true });
});

test("[gateway] /platform-status is limited to admin and on-call sessions", async () => {
  assertEquals((await call("/platform-status", { cookie: false })).status, 403);
  h.validateToken.mockResolvedValue(TRADER);
  assertEquals((await call("/platform-status")).status, 403);
  h.validateToken.mockResolvedValue(ADMIN);
  const body = await json(await call("/platform-status"));
  assertEquals(body.ticketing, { ok: true });
  assert(typeof body.uptimeMs === "number");
});

test("[gateway] /services/status strips meta for anonymous callers", async () => {
  const anonymous = await json(await call("/services/status", { cookie: false }));
  const known = await json(await call("/services/status"));
  const metaOf = (body: Record<string, unknown>) =>
    (body.services as Array<{ id: string; meta: Record<string, unknown> }>).find(
      (s) => s.id === "ems"
    )?.meta;
  assertEquals(metaOf(anonymous), {});
  assertEquals(metaOf(known), { secret: true });
});

test("[gateway] /ready reports a summary anonymously and detail to sessions", async () => {
  const anonymous = await call("/ready", { cookie: false });
  assertEquals(anonymous.status, 200);
  assertEquals((await json(anonymous)).services, undefined);

  const detailed = await json(await call("/ready"));
  assertEquals(detailed.ready, true);
  assertEquals(detailed.producerReady, true);
  assertEquals(detailed.upgradeInProgress, true);
  assertEquals(detailed.upgradeMessage, "maintenance");
  assertEquals(detailed.dataDepth, { totalSymbols: 3, avgDays: 2, minDays: 1, queriedAt: 5 });
});

test("[gateway] /system requires a session", async () => {
  assertEquals((await call("/system", { cookie: false })).status, 401);
  assertEquals((await call("/system")).status, 200);
});

test("[gateway] upgrade-status updates are admin-only and validated", async () => {
  const put = (body: unknown, raw = false) =>
    call("/upgrade-status", {
      method: "PUT",
      origin: "http://app.test",
      body: raw ? (body as string) : JSON.stringify(body),
    });

  h.validateToken.mockResolvedValue(TRADER);
  assertEquals((await put({ inProgress: true })).status, 403);

  h.validateToken.mockResolvedValue(ADMIN);
  assertEquals((await put("{nope", true)).status, 400);
  assertEquals((await put({ inProgress: "yes" })).status, 400);
  assertEquals((await put({ inProgress: true, message: 5 })).status, 400);
  assertEquals((await put({ inProgress: true, message: "x".repeat(281) })).status, 400);

  const ok = await put({ inProgress: false, message: "back" });
  assertEquals(await json(ok), { inProgress: false, message: "back" });
  assertEquals(h.publishAudit.mock.calls.length, 1);
  assertEquals(h.broadcastAll.mock.calls[0][0].event, "upgradeStatus");
});

test("[gateway] /ws/market-sim hands off to the market-sim proxy", async () => {
  assertEquals(await (await call("/ws/market-sim")).text(), "proxied-ws");
});

test("[gateway] rejects state-changing requests from a foreign origin", async () => {
  const res = await call("/api/ems/orders", {
    method: "POST",
    origin: "http://evil.test",
    body: "{}",
  });
  assertEquals(res.status, 403);
  const refererOnly = await call("/api/ems/orders", {
    method: "POST",
    headers: { referer: "not a url" },
    body: "{}",
  });
  assertEquals(refererOnly.status, 403);
});

test("[gateway] returns 401 when the session token is not accepted", async () => {
  h.validateToken.mockResolvedValue(null);
  assertEquals((await call("/features")).status, 401);
});

test("[gateway] returns the first route module response that claims the request", async () => {
  h.routeResults.set("logs", new Response("from-logs"));
  assertEquals(await (await call("/logs/query")).text(), "from-logs");
});

test("[gateway] /api/gateway/ forwards to itself and relays the upstream response", async () => {
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(
      new Response("relayed", {
        status: 202,
        headers: { "Content-Type": "text/plain", "set-cookie": "a=b" },
      })
    )
  );
  const res = await call("/api/gateway/features?x=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assertEquals(res.status, 202);
  assertEquals(res.headers.get("set-cookie"), "a=b");
  assertEquals(await res.text(), "relayed");
  const [target, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  assert(target.endsWith("/features?x=1"));
  assertEquals(init.method, "POST");
});

test("[gateway] /api/gateway/ answers 502 when the self call fails", async () => {
  fetchMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));
  const res = await call("/api/gateway/features");
  assertEquals(res.status, 502);
  assertEquals(await json(res), { error: "boom" });
});

test("[gateway] proxies service routes by method after a role check", async () => {
  h.validateToken.mockResolvedValue(ADMIN);
  assertEquals(await (await call("/api/ems/orders")).text(), "get-ok");
  assertEquals(await (await call("/api/ems/orders", { method: "DELETE" })).text(), "get-ok");
  const post = await call("/api/ems/orders", {
    method: "POST",
    origin: "http://app.test",
    body: "{}",
  });
  assertEquals(post.status, 201);
  const put = await call("/api/ems/orders", {
    method: "PUT",
    origin: "http://app.test",
    body: "{}",
  });
  assertEquals(await put.text(), "put-ok");
});

test("[gateway] lets public service paths through without a session", async () => {
  const res = await call("/api/user-service/oauth/token", { cookie: false });
  assertEquals(await res.text(), "get-ok");
  assertEquals((await call("/api/oms/health", { cookie: false })).status, 200);
  const batch = await call("/api/kafka-relay/events/batch", {
    method: "POST",
    cookie: false,
    body: "{}",
  });
  assertEquals(batch.status, 201);
});

test("[gateway] forbids roles outside the service allow-list", async () => {
  h.validateToken.mockResolvedValue(TRADER);
  const res = await call("/api/market-sim/admin/reset");
  assertEquals(res.status, 403);
  const audit = await call("/api/journal/audit/verify");
  assertEquals(audit.status, 403);
});

test("[gateway] lets a user read their own risk positions but nobody else's", async () => {
  h.validateToken.mockResolvedValue(TRADER);
  assertEquals((await call("/api/risk-engine/positions/t-1")).status, 200);
  assertEquals((await call("/api/risk-engine/positions/other")).status, 403);
});

test("[gateway] lets any signed-in role use the replay recording routes", async () => {
  h.validateToken.mockResolvedValue({
    ...TRADER,
    user: { ...TRADER.user, role: "viewer" },
  });
  assertEquals((await call("/api/replay/config")).status, 200);
  const created = await call("/api/replay/sessions", {
    method: "POST",
    origin: "http://app.test",
    body: "{}",
  });
  assertEquals(created.status, 201);
});

test("[gateway] audits successful privileged proxied calls", async () => {
  h.validateToken.mockResolvedValue(ADMIN);
  await call("/api/market-sim/admin/reset", {
    method: "PUT",
    origin: "http://app.test",
    body: "{}",
  });
  assertEquals(h.publishAudit.mock.calls.length, 1);
  assertEquals(h.publishAudit.mock.calls[0][0].action, "market_sim_admin");

  h.publishAudit.mockClear();
  h.proxyPut.mockResolvedValueOnce(new Response("denied", { status: 500 }));
  await call("/api/market-sim/admin/reset", {
    method: "PUT",
    origin: "http://app.test",
    body: "{}",
  });
  assertEquals(h.publishAudit.mock.calls.length, 0);
});

test("[gateway] serves the frontend bundle with an index fallback", async () => {
  h.serveDir.mockResolvedValueOnce(new Response("asset", { status: 200 }));
  assertEquals(await (await call("/assets/app.js", { cookie: false })).text(), "asset");

  h.serveDir
    .mockResolvedValueOnce(new Response("nf", { status: 404 }))
    .mockResolvedValueOnce(new Response("index", { status: 200 }));
  assertEquals(await (await call("/dashboard", { cookie: false })).text(), "index");

  h.serveDir.mockResolvedValueOnce(new Response("nf", { status: 404 }));
  assertEquals((await call("/assets/missing.js", { cookie: false })).status, 404);
});

test("[gateway] answers 404 for unknown non-GET paths", async () => {
  assertEquals((await call("/nope", { method: "POST", origin: "http://app.test" })).status, 404);
});

test("[gateway] fans bus messages out to websocket clients", () => {
  const send = (group: string, topic: string, value: unknown) => {
    const handler = h.consumers.get(group);
    assert(handler, `missing consumer ${group}`);
    handler(topic, value);
  };

  send("gateway-market", "market.ticks", { p: 1 });
  send("gateway-algo", "algo.heartbeat", { a: 1 });
  send("gateway-news", "news.feed", { n: 1 });
  send("gateway-recommendations", "market.recommendations", { r: 1 });
  send("gateway-advisory", "llm.advisory.ready", { v: 1 });
  send("gateway-llm-state", "llm.state.update", { l: 1 });
  send("gateway-risk-breaker", "risk.breaker", { b: 1 });
  const events = h.broadcastAll.mock.calls.map((c) => c[0].event);
  assertEquals(events, [
    "marketUpdate",
    "algoHeartbeat",
    "newsUpdate",
    "recommendationUpdate",
    "advisoryUpdate",
    "llmStateUpdate",
    "riskBreaker",
  ]);
});

test("[gateway] routes order events to the owner and to compliance", () => {
  const orders = h.consumers.get("gateway-orders");
  assert(orders);
  orders("orders.new", { userId: "t-1", userRole: "trader" });
  assertEquals(h.broadcastToUser.mock.calls.length, 1);
  assertEquals(h.broadcastToRoles.mock.calls[0][0], ["compliance", "admin"]);

  h.broadcastToRoles.mockClear();
  orders("orders.new", { userId: "a-1", userRole: "admin" });
  assertEquals(h.broadcastToRoles.mock.calls.length, 0);

  orders("orders.new", { orderId: "anonymous" });
  assertEquals(h.broadcastAll.mock.calls.at(-1)?.[0].event, "orderEvent");
});

test("[gateway] routes rfq, dark pool and ccp events to the right audience", () => {
  const rfq = h.consumers.get("gateway-rfq");
  assert(rfq);
  rfq("rfq.quote.update", { userId: "u1" });
  rfq("rfq.sellside.update", { clientUserId: "c1", salesUserId: "s1" });
  const recipients = h.broadcastToUser.mock.calls.map((c) => c[0]);
  assertEquals(recipients, ["u1", "c1", "s1"]);

  h.broadcastToUser.mockClear();
  const dark = h.consumers.get("gateway-dark");
  assert(dark);
  dark("dark.execution", { buyUserId: "b", sellUserId: "s" });
  dark("dark.execution", { buyUserId: "same", sellUserId: "same" });
  assertEquals(
    h.broadcastToUser.mock.calls.map((c) => c[0]),
    ["b", "s", "same"]
  );

  const ccp = h.consumers.get("gateway-ccp");
  assert(ccp);
  ccp("ccp.margin", { userId: "u9" });
  ccp("ccp.margin", {});
  assertEquals(h.broadcastToUser.mock.calls.at(-1)?.[0], "u9");
  assertEquals(h.broadcastToRoles.mock.calls.at(-1)?.[0], ["compliance", "admin"]);
});

test("[gateway] batches signal and feature updates per symbol", async () => {
  const signals = h.consumers.get("gateway-signals");
  const features = h.consumers.get("gateway-features");
  assert(signals && features);
  signals("market.signals", { symbol: "AAPL", v: 1 });
  signals("market.signals", { symbol: "AAPL", v: 2 });
  signals("market.signals", { symbol: "MSFT", v: 3 });
  features("market.features", { symbol: "AAPL", v: 1 });
  await vi.advanceTimersByTimeAsync(600);
  const events = h.broadcastAll.mock.calls.map((c) => c[0].event);
  assertEquals(events.filter((e: string) => e === "signalUpdate").length, 2);
  assertEquals(events.filter((e: string) => e === "featureUpdate").length, 1);
});

test("[gateway] falls back to the market-sim socket only when the bus is quiet", () => {
  const socket = h.sockets.at(-1);
  assert(socket?.onmessage);
  const before = h.broadcastAll.mock.calls.length;

  h.consumers.get("gateway-market")?.("market.ticks", {});
  socket.onmessage({ data: JSON.stringify({ event: "marketData", data: { x: 1 } }) });
  assertEquals(h.broadcastAll.mock.calls.length, before + 1);
});

test("[gateway] relays market-sim socket data and survives bad frames", () => {
  const socket = h.sockets.at(-1);
  assert(socket?.onmessage);
  vi.setSystemTime(Date.now() + 10_000);
  const before = h.broadcastAll.mock.calls.length;
  socket.onmessage({ data: JSON.stringify({ event: "marketUpdate", data: { y: 1 } }) });
  socket.onmessage({ data: JSON.stringify({ event: "other" }) });
  socket.onmessage({ data: "not json" });
  assertEquals(h.broadcastAll.mock.calls.length, before + 1);

  const count = h.sockets.length;
  socket.onclose?.();
  vi.advanceTimersByTime(5_000);
  assertEquals(h.sockets.length, count + 1);
  socket.onerror?.();
  assertEquals(socket.close.mock.calls.length, 1);
});

test("[gateway] publishes access events for authenticated requests", async () => {
  await call("/features");
  const actions = h.send.mock.calls.map((c) => c[1].action);
  assert(actions.includes("http_request"));
});

test("[gateway] routes kill-switch and rejection events to the alert router", async () => {
  const { notifyOperators } = await import("../notifications/discord-notifier.ts");
  const notify = vi.mocked(notifyOperators).mockClear().mockResolvedValue(true);
  const router = h.consumers.get("gateway-alert-router");
  assert(router);
  router("orders.rejected", { reason: "x" });
  router("orders.kill.audit", {
    scope: "all",
    issuedBy: "u",
    issuedByRole: "admin",
    ts: Date.now(),
    cancelledCount: 0,
    cancelledIds: [],
  });
  assertEquals(notify.mock.calls.length, 1);
  assert(notify.mock.calls[0][0].includes("Kill switch engaged"));
  assert(notify.mock.calls[0][0].includes("Issued by u (admin); 0 orders cancelled"));
});
