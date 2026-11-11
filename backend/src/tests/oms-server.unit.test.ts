import { afterEach, beforeEach, vi } from "vitest";
import { CheckRequestSchema } from "#veta/schemas/risk";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;
type Listener = (topic: string, raw: unknown) => void | Promise<void>;

const h = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  listeners: {} as Record<string, Listener>,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
  limits: {} as Record<string, { status: number; body?: unknown }>,
  risk: {
    allowed: true,
    reasons: [] as string[],
    warnings: [] as string[],
    fail: false,
  },
  prices: { AAPL: 190 } as Record<string, number> | null,
  assets: [{ symbol: "AAPL", lotSize: 100 }] as unknown,
  journalOrders: [] as unknown[],
  requests: [] as string[],
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/wait-for", () => ({ waitForUrl: () => Promise.resolve(true) }));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () =>
    Promise.resolve({
      send: (topic: string, payload: Record<string, unknown>) => {
        h.sent.push({ topic, payload });
        return Promise.resolve();
      },
    }),
  createConsumer: (group: string) =>
    Promise.resolve({
      onMessage: (fn: Listener) => {
        h.listeners[group] = fn;
      },
    }),
}));

function routeFetch(input: string | URL): Promise<Response> {
  const url = String(input);
  h.requests.push(url);
  const limitsMatch = url.match(/\/users\/([^/]+)\/limits$/);
  if (limitsMatch) {
    const entry = h.limits[decodeURIComponent(limitsMatch[1])];
    if (!entry) return Promise.reject(new Error("no route"));
    return Promise.resolve(
      new Response(JSON.stringify(entry.body ?? {}), { status: entry.status })
    );
  }
  if (url.endsWith("/check")) {
    if (h.risk.fail) return Promise.reject(new Error("risk down"));
    return Promise.resolve(new Response(JSON.stringify(h.risk)));
  }
  if (url.endsWith("/prices")) {
    return h.prices
      ? Promise.resolve(new Response(JSON.stringify(h.prices)))
      : Promise.resolve(new Response("{}", { status: 500 }));
  }
  if (url.endsWith("/assets")) return Promise.resolve(new Response(JSON.stringify(h.assets)));
  if (url.includes("/orders?"))
    return Promise.resolve(new Response(JSON.stringify(h.journalOrders)));
  return Promise.resolve(new Response("{}", { status: 404 }));
}

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  h.sent.length = 0;
  await import("../oms/oms-server.ts");
  await vi.advanceTimersByTimeAsync(0);
}

const FULL_LIMITS = {
  max_order_qty: 50_000,
  max_daily_notional: 10_000_000,
  allowed_strategies: ["LIMIT", "TWAP"],
  allowed_desks: ["equity", "fi", "derivatives", "fx"],
  dark_pool_access: true,
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    clientOrderId: "c-1",
    userId: "trader-1",
    userRole: "trader",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 190,
    ...overrides,
  };
}

async function submit(raw: unknown) {
  await h.listeners["oms-new-orders"]("orders.new", raw);
}

function last(topic: string) {
  return h.sent.filter((s) => s.topic === topic).pop()?.payload;
}

async function call(path: string, init: RequestInit = {}) {
  assert(h.handler);
  return await h.handler(new Request(`http://oms${path}`, init));
}

function rejection() {
  return String(last("orders.rejected")?.reason);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  vi.stubGlobal("fetch", routeFetch);
  h.limits = { "trader-1": { status: 200, body: FULL_LIMITS } };
  h.risk = { allowed: true, reasons: [], warnings: [], fail: false };
  h.prices = { AAPL: 190 };
  h.assets = [{ symbol: "AAPL", lotSize: 100 }];
  h.journalOrders = [];
  h.requests = [];
  await load();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("[oms] serves health and rejects other routes", async () => {
  const health = await call("/health");
  assertEquals(await health.json(), {
    service: "oms",
    version: "dev",
    status: "ok",
    riskEngineEnabled: true,
  });
  assertEquals((await call("/x", { method: "OPTIONS" })).status, 204);
  assertEquals((await call("/x")).status, 404);
});

test("[oms] /orders/active reports whether an order is still active", async () => {
  await submit(order({ clientOrderId: "active-1" }));
  const orderId = String(last("orders.submitted")?.orderId);

  assertEquals(
    await (
      await call(`/orders/active?orderId=${encodeURIComponent(orderId)}&userId=trader-1`)
    ).json(),
    { active: true }
  );
  assertEquals(await (await call("/orders/active?clientOrderId=active-1&userId=trader-1")).json(), {
    active: true,
  });
  assertEquals(
    await (await call("/orders/active?clientOrderId=active-1&userId=someone-else")).json(),
    { active: false }
  );

  await kill({});
  assertEquals(
    await (
      await call(`/orders/active?orderId=${encodeURIComponent(orderId)}&userId=trader-1`)
    ).json(),
    { active: false }
  );
});

test("[oms] /orders/active requires orderId or clientOrderId", async () => {
  const res = await call("/orders/active");
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "orderId or clientOrderId is required",
  });
});

test("[oms] routes an accepted equity order to the lit venue", async () => {
  await submit(order());
  const submitted = last("orders.submitted");
  const routed = last("orders.routed");
  assertEquals(submitted?.desk, "equity");
  assertEquals(submitted?.marketType, "lit");
  assertEquals(submitted?.destinationVenue, "XNAS");
  assertEquals(submitted?.timeInForce, "GTC");
  assertEquals(routed?.strategy, "LIMIT");
  assertEquals(String(routed?.orderId).startsWith("oms-"), true);
});

test("[oms] stamps regulatory identifiers on submitted and routed orders", async () => {
  vi.stubEnv("FIRM_LEI", "529900T8BM49AURSDO55");
  h.limits = {
    "trader-1": {
      status: 200,
      body: {
        ...FULL_LIMITS,
        client_code: "CLIENT-9",
        decision_maker_code: "DM-7",
      },
    },
  };
  await load({ FIRM_LEI: "529900T8BM49AURSDO55" });
  await submit(order({ strategy: "TWAP" }));
  for (const topic of ["orders.submitted", "orders.routed"]) {
    const payload = last(topic);
    assertEquals(payload?.algoId, "VETA-TWAP");
    assertEquals(payload?.algoVersion, "1.0.0");
    assertEquals(payload?.orderType, "LIMIT");
    assertEquals(payload?.lei, "529900T8BM49AURSDO55");
    assertEquals(payload?.clientCode, "CLIENT-9");
    assertEquals(payload?.decisionMakerCode, "DM-7");
    assertEquals(payload?.executionDecisionCode, "VETA-TWAP");
  }
});

test("[oms] derives time in force from the expiry", async () => {
  await submit(order({ clientOrderId: "a", expiresAt: 30 }));
  assertEquals(last("orders.submitted")?.timeInForce, "IOC");
  await submit(order({ clientOrderId: "b", expiresAt: 3_600 }));
  assertEquals(last("orders.submitted")?.timeInForce, "DAY");
});

test("[oms] rejects malformed orders with the schema issues", async () => {
  await submit({ clientOrderId: "bad", quantity: -1 });
  assertEquals(rejection().startsWith("schema_invalid"), true);
  assertEquals(last("orders.rejected")?.userId, "unknown");
});

test("[oms] rejects read-only and non-trading roles", async () => {
  const cases: Array<[string, string]> = [
    ["admin", "Admin"],
    ["compliance", "Compliance"],
    ["sales", "Sales"],
    ["viewer", "Viewer"],
    ["desk-head", "Desk-head"],
    ["risk-manager", "Risk Manager"],
    ["external-client", "External-client"],
  ];
  for (const [role, label] of cases) {
    await submit(order({ userRole: role }));
    assertEquals(rejection().startsWith(label), true);
  }
  assertEquals(last("orders.routed"), undefined);
});

test("[oms] rejects when trading limits cannot be fetched", async () => {
  await submit(order({ userId: "unknown-user" }));
  assertEquals(rejection().includes("temporarily unavailable"), true);

  h.limits["broken"] = { status: 500 };
  await submit(order({ userId: "broken" }));
  assertEquals(rejection().includes("temporarily unavailable"), true);
});

test("[oms] caches trading limits between orders", async () => {
  await submit(order({ clientOrderId: "a" }));
  await submit(order({ clientOrderId: "b" }));
  assertEquals(h.requests.filter((u) => u.includes("/limits")).length, 1);
  await vi.advanceTimersByTimeAsync(31_000);
  await submit(order({ clientOrderId: "c" }));
  assertEquals(h.requests.filter((u) => u.includes("/limits")).length, 2);
});

test("[oms] enforces desk access", async () => {
  h.limits["trader-1"] = {
    status: 200,
    body: { ...FULL_LIMITS, allowed_desks: ["equity"] },
  };
  await submit(order({ instrumentType: "fx", asset: "EURUSD" }));
  assertEquals(rejection().includes("does not have access to the fx desk"), true);
});

test("[oms] applies pre-trade risk checks", async () => {
  h.risk = {
    allowed: false,
    reasons: ["too big", "too risky"],
    warnings: [],
    fail: false,
  };
  await submit(order());
  assertEquals(rejection(), "Risk check failed: too big; too risky");

  h.risk = {
    allowed: true,
    reasons: [],
    warnings: ["near limit"],
    fail: false,
  };
  await submit(order({ clientOrderId: "w" }));
  assertEquals(last("orders.routed")?.clientOrderId, "w");

  h.risk.fail = true;
  await submit(order({ clientOrderId: "f" }));
  assertEquals(rejection().includes("Risk engine unavailable"), true);
});

test("[oms] sends the risk engine a request that satisfies its contract", async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    if (String(input).endsWith("/check")) bodies.push(JSON.parse(String(init?.body)));
    return routeFetch(input);
  });
  await submit(order());
  assertEquals(bodies.length, 1);
  assertEquals(CheckRequestSchema.safeParse(bodies[0]).success, true);
});

test("[oms] risk checks an order without a limit price at the market price", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    if (String(input).endsWith("/check")) bodies.push(JSON.parse(String(init?.body)));
    return routeFetch(input);
  });
  await submit(order({ limitPrice: undefined }));
  assertEquals(bodies[0]?.limitPrice, 190);
  assertEquals(last("orders.routed")?.clientOrderId, "c-1");
});

test("[oms] rejects an order without a limit price when no market price exists", async () => {
  h.prices = null;
  await submit(order({ limitPrice: undefined }));
  assertEquals(rejection().includes("No reference price available for AAPL"), true);
  assertEquals(
    h.requests.some((u) => u.endsWith("/check")),
    false
  );
});

test("[oms] blocks an order when the risk engine returns a malformed allowance", async () => {
  vi.stubGlobal("fetch", (input: string) =>
    String(input).endsWith("/check")
      ? Promise.resolve(new Response(JSON.stringify({ allowed: "yes" })))
      : routeFetch(input)
  );
  await submit(order());
  assertEquals(last("orders.routed"), undefined);
  assertEquals(rejection().includes("Risk engine unavailable"), true);
});

test("[oms] skips risk checks when the risk engine is disabled", async () => {
  await load({ RISK_ENGINE_ENABLED: "false" });
  const audit = h.sent.find((m) => m.topic === "audit.events");
  assertEquals(audit?.payload.action, "risk_engine_disabled");
  h.risk.fail = true;
  await submit(order());
  assertEquals(last("orders.routed")?.clientOrderId, "c-1");
  assertEquals(
    h.requests.some((u) => u.endsWith("/check")),
    false
  );
});

test("[oms] sends the internal service token when configured", async () => {
  const seen: Array<Record<string, string>> = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    seen.push((init?.headers ?? {}) as Record<string, string>);
    return routeFetch(input);
  });
  await load({ INTERNAL_SERVICE_TOKEN: "secret" });
  await submit(order({ userId: "trader-1" }));
  assert(seen.some((headers) => Object.values(headers).includes("secret")));
});

test("[oms] bond orders need a bond spec and go to the RFQ service", async () => {
  const bondSpec = {
    isin: "US912828XX00",
    symbol: "UST10Y",
    description: "10Y",
    couponRate: 0.04,
    maturityDate: "2036-01-01",
    totalPeriods: 20,
    periodsPerYear: 2,
    faceValue: 100,
    yieldAtOrder: 0.04,
    creditRating: "AAA",
  };
  await submit(order({ instrumentType: "bond", asset: "UST10Y" }));
  assertEquals(rejection().startsWith("Bond orders require bondSpec"), true);

  await submit(order({ instrumentType: "bond", asset: "UST10Y", bondSpec }));
  const rfq = last("orders.fi.rfq");
  assertEquals(rfq?.destinationVenue, "RFQ");
  assertEquals(rfq?.marketType, "otc");
  assertEquals(rfq?.strategy, "LIMIT");
  assertEquals(last("orders.routed"), undefined);
});

test("[oms] option orders need a spec and route listed or OTC", async () => {
  await submit(order({ instrumentType: "option", asset: "AAPL240119C00190000" }));
  assertEquals(rejection().startsWith("Option orders require optionSpec"), true);

  const optionSpec = { optionType: "call", strike: 190, expirySecs: 86_400 };
  await submit(order({ clientOrderId: "listed", instrumentType: "option", optionSpec }));
  assertEquals(last("orders.routed")?.destinationVenue, "XNAS");

  await submit(
    order({
      clientOrderId: "otc",
      instrumentType: "option",
      optionSpec: { ...optionSpec, isOtc: true },
    })
  );
  const otc = last("orders.routed");
  assertEquals(otc?.destinationVenue, "OTC-OPTIONS");
  assertEquals(otc?.marketType, "otc");
});

test("[oms] fx orders route to EBS", async () => {
  await submit(order({ instrumentType: "fx", asset: "EURUSD", limitPrice: 1.1 }));
  assertEquals(last("orders.routed")?.destinationVenue, "EBS");
});

test("[oms] commodity orders route to the exchange when permitted", async () => {
  h.limits["trader-1"] = {
    status: 200,
    body: { ...FULL_LIMITS, allowed_desks: ["commodities"] },
  };
  await submit(order({ instrumentType: "commodity", asset: "CL", limitPrice: 80 }));
  assertEquals(last("orders.routed")?.destinationVenue, "XCME");
});

test("[oms] validates strategy against the known and permitted sets", async () => {
  await submit(order({ strategy: "nonsense" }));
  assertEquals(rejection().startsWith("schema_invalid: strategy"), true);
  await submit(order({ strategy: "VWAP" }));
  assertEquals(rejection(), "Strategy VWAP is not permitted for your account");
  await submit(order({ clientOrderId: "twap", strategy: "TWAP" }));
  assertEquals(last("orders.routed")?.strategy, "TWAP");
});

test("[oms] enforces the maximum order quantity", async () => {
  await submit(order({ quantity: 60_000 }));
  assertEquals(rejection().includes("exceeds your limit of 50000"), true);
});

test("[oms] routes large equity blocks to the dark pool for permitted users", async () => {
  await submit(order({ quantity: 20_000 }));
  const routed = last("orders.routed");
  assertEquals(routed?.marketType, "dark");
  assertEquals(routed?.destinationVenue, "DARK1");

  h.limits["trader-1"] = {
    status: 200,
    body: { ...FULL_LIMITS, dark_pool_access: false },
  };
  await vi.advanceTimersByTimeAsync(31_000);
  await submit(order({ clientOrderId: "lit", quantity: 20_000 }));
  assertEquals(last("orders.routed")?.marketType, "lit");
});

test("[oms] market orders use the market price for the daily notional check", async () => {
  await submit(order({ limitPrice: undefined }));
  assertEquals(last("orders.routed")?.clientOrderId, "c-1");

  h.prices = null;
  await vi.advanceTimersByTimeAsync(3_000);
  await submit(order({ clientOrderId: "np", limitPrice: undefined, asset: "MSFT" }));
  assertEquals(rejection().includes("No reference price available for MSFT"), true);
});

test("[oms] rejects orders that would exceed the daily notional", async () => {
  h.limits["trader-1"] = {
    status: 200,
    body: { ...FULL_LIMITS, max_daily_notional: 25_000 },
  };
  await submit(order({ clientOrderId: "first", quantity: 100 }));
  assertEquals(last("orders.routed")?.clientOrderId, "first");
  await submit(order({ clientOrderId: "second", quantity: 100 }));
  assertEquals(rejection().includes("above your daily limit"), true);
});

test("[oms] tolerates unavailable asset metadata when checking lot sizes", async () => {
  h.assets = {};
  await submit(order({ quantity: 150 }));
  assertEquals(last("orders.routed")?.clientOrderId, "c-1");
  await submit(order({ clientOrderId: "again", quantity: 150 }));
  assertEquals(last("orders.routed")?.clientOrderId, "again");
});

async function placeOrders() {
  h.limits["trader-2"] = { status: 200, body: FULL_LIMITS };
  await submit(order({ clientOrderId: "t1-a", asset: "AAPL", strategy: "LIMIT" }));
  await submit(
    order({
      clientOrderId: "t1-b",
      asset: "MSFT",
      strategy: "TWAP",
      limitPrice: 400,
    })
  );
  await submit(order({ clientOrderId: "t2-a", userId: "trader-2", asset: "AAPL" }));
  h.sent.length = 0;
}

function kill(cmd: Record<string, unknown>) {
  return h.listeners["oms-kill-orders"]("orders.kill", {
    ts: Date.now(),
    issuedBy: "trader-1",
    issuedByRole: "trader",
    scope: "all",
    ...cmd,
  });
}

function cancelled() {
  return h.sent
    .filter((s) => s.topic === "orders.cancelled")
    .map((s) => s.payload.clientOrderId)
    .sort();
}

test("[oms] a trader kill-all only cancels their own orders", async () => {
  await placeOrders();
  await kill({});
  assertEquals(cancelled(), ["t1-a", "t1-b"]);
  const audit = last("orders.kill.audit");
  assertEquals(audit?.cancelledCount, 2);
});

test("[oms] an admin kill-all cancels everything", async () => {
  await placeOrders();
  await kill({ issuedBy: "boss", issuedByRole: "admin" });
  assertEquals(cancelled(), ["t1-a", "t1-b", "t2-a"]);
});

test("[oms] kill scopes select by user, algo, market and symbol", async () => {
  await placeOrders();
  await kill({
    scope: "user",
    issuedBy: "boss",
    issuedByRole: "admin",
    targetUserId: "trader-2",
  });
  assertEquals(cancelled(), ["t2-a"]);

  h.sent.length = 0;
  await kill({ scope: "algo", scopeValue: "TWAP" });
  assertEquals(cancelled(), ["t1-b"]);

  await placeOrders();
  await kill({ scope: "symbol", scopeValue: "AAPL" });
  assertEquals(cancelled(), ["t1-a"]);

  await placeOrders();
  await kill({ scope: "market", scopeValue: "MS" });
  assertEquals(cancelled(), ["t1-b"]);

  await placeOrders();
  await kill({ scope: "market", scopeValue: "*" });
  assertEquals(cancelled().length, 2);

  await placeOrders();
  await kill({ scope: "market" });
  assertEquals(cancelled().length, 2);

  await placeOrders();
  await kill({ scope: "user" });
  assertEquals(cancelled(), ["t1-a", "t1-b"]);
});

test("[oms] kill commands are validated and authorised", async () => {
  await placeOrders();
  await h.listeners["oms-kill-orders"]("orders.kill", { scope: "bogus" });
  await kill({ scope: "user", targetUserId: "trader-2" });
  await kill({ scope: "symbol", scopeValue: "NONE" });
  assertEquals(h.sent.length, 0);
});

test("[oms] resume commands publish immediately or after the scheduled delay", async () => {
  const base = {
    ts: Date.now(),
    issuedBy: "boss",
    issuedByRole: "admin",
    scope: "all",
  };
  await h.listeners["oms-kill-orders"]("orders.resume", base);
  assertEquals(last("orders.resumed")?.issuedBy, "boss");
  assertEquals(last("orders.resume.audit")?.scope, "all");

  h.sent.length = 0;
  await h.listeners["oms-kill-orders"]("orders.resume", {
    ...base,
    resumeAt: Date.now() + 5_000,
  });
  assertEquals(h.sent.length, 0);
  await vi.advanceTimersByTimeAsync(5_000);
  assertEquals(topicsOf(), ["orders.resumed", "orders.resume.audit"]);

  h.sent.length = 0;
  await h.listeners["oms-kill-orders"]("orders.resume", { scope: "nope" });
  assertEquals(h.sent.length, 0);
});

function topicsOf() {
  return h.sent.map((s) => s.topic);
}

test("[oms] expires orphaned working orders found in the journal", async () => {
  const past = Date.now() - 1_000;
  h.journalOrders = [
    {
      id: "o-1",
      clientOrderId: "c-1",
      status: "working",
      expiresAt: past,
      userId: "u",
    },
    { id: "o-2", status: "pending", expiresAt: past },
    { id: "o-3", status: "working", expiresAt: Date.now() + 60_000 },
    { id: "o-4", status: "filled", expiresAt: past },
  ];
  h.sent.length = 0;
  await vi.advanceTimersByTimeAsync(15_000);
  const expired = h.sent.filter((s) => s.topic === "orders.expired");
  assertEquals(
    expired.map((e) => [e.payload.orderId, e.payload.clientOrderId]),
    [
      ["o-1", "c-1"],
      ["o-2", "o-2"],
    ]
  );
  assertEquals(expired[0].payload.reason, "expired_on_oms_restart");
});

test("[oms] the orphan sweep survives journal failures", async () => {
  vi.stubGlobal("fetch", (input: string) =>
    String(input).includes("/orders?")
      ? Promise.resolve(new Response("{}", { status: 500 }))
      : routeFetch(input)
  );
  await vi.advanceTimersByTimeAsync(15_000);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  await vi.advanceTimersByTimeAsync(15_000);
  assertEquals(h.sent.filter((s) => s.topic === "orders.expired").length, 0);
});
