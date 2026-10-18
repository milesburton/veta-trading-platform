import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;
type Listener = (topic: string, raw: unknown) => void;

const h = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  listeners: {} as Record<string, Listener>,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
  assets: [] as unknown[],
  store: {
    load: vi.fn(),
    current: vi.fn(),
    versionId: vi.fn(),
    history: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("#veta/bootstrap", () => ({}));
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
vi.mock("../risk-engine/config-store.ts", () => ({ createConfigStore: () => h.store }));

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("RISK_ENGINE_MARKET_HOURS_ENFORCED", "false");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  h.sent.length = 0;
  await import("../risk-engine/risk-engine.ts");
  await vi.advanceTimersByTimeAsync(0);
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  assert(h.handler);
  return h.handler(
    new Request(`http://risk${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

function topics() {
  return h.sent.map((s) => s.topic);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  h.assets = [
    { symbol: "AAPL", price: 100, volume: 1_000_000, exchange: "XNAS", assetClass: "equity" },
    { symbol: "MSFT", initialPrice: 400, dailyVolume: 500_000 },
    { symbol: "DEAD", price: 0 },
  ];
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(h.assets))));
  for (const fn of Object.values(h.store)) fn.mockReset();
  h.store.load.mockResolvedValue(undefined);
  h.store.current.mockReturnValue({ id: 3, config: { haltMovePercent: 15 } });
  h.store.versionId.mockReturnValue(7);
  h.store.history.mockResolvedValue([{ id: 1 }]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const CHECK = { userId: "u-1", symbol: "AAPL", side: "BUY", quantity: 10, limitPrice: 100 };

test("[risk-engine] loads prices from market-sim and reports health", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  const health = await (await call("GET", "/health")).json();
  assertEquals(health.service, "risk-engine");
  assertEquals(health.pricesTracked, 2);
  assertEquals(health.volumesTracked, 2);
  assertEquals(health.config.marketHoursEnforced, false);
  assertEquals((await call("OPTIONS", "/health")).status, 204);
  assertEquals((await call("GET", "/nope")).status, 404);
});

test("[risk-engine] tolerates market-sim being unavailable", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  assertEquals((await (await call("GET", "/health")).json()).pricesTracked, 0);
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
  await vi.advanceTimersByTimeAsync(5_000);
  assertEquals((await (await call("GET", "/health")).json()).pricesTracked, 0);
});

test("[risk-engine] hot-loads the persisted config outside test mode", async () => {
  await load();
  assertEquals(h.store.load.mock.calls.length, 1);
  assertEquals((await (await call("GET", "/config")).json()).haltMovePercent, 15);
  assertEquals((await (await call("GET", "/config")).json()).version, 7);
});

test("[risk-engine] approves a sane order and rejects a fat finger", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  await call("PUT", "/config", { maxConcentrationPct: 100 });
  const ok = await (await call("POST", "/check", CHECK)).json();
  assertEquals(ok.reasons, []);
  assertEquals(ok.allowed, true);
  assertEquals(ok.riskConfigVersion, 7);

  const fat = await (await call("POST", "/check", { ...CHECK, limitPrice: 150 })).json();
  assertEquals(fat.allowed, false);
  assert(fat.reasons.length > 0);

  assertEquals((await call("POST", "/check", { userId: "u-1" })).status, 400);
});

test("[risk-engine] tracks order counts and working orders from the bus", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  const orders = h.listeners["risk-engine-orders"];
  orders("orders.submitted", { userId: "u-1", clientOrderId: "c-1" });
  orders("orders.submitted", { userId: "u-1", clientOrderId: "c-2" });
  orders("orders.submitted", { clientOrderId: "no-user" });
  orders("orders.routed", { userId: "u-1", clientOrderId: "c-1", asset: "AAPL", side: "BUY" });
  orders("orders.routed", { userId: "u-1", clientOrderId: "c-2", symbol: "MSFT", side: "SELL" });
  let health = await (await call("GET", "/health")).json();
  assertEquals(health.activeUsers, 1);
  assertEquals(health.workingOrders, 2);

  for (const topic of ["orders.cancelled", "orders.rejected"]) {
    orders(topic, { userId: "u-1", clientOrderId: topic === "orders.cancelled" ? "c-1" : "c-2" });
  }
  orders("orders.expired", { userId: "ghost" });
  health = await (await call("GET", "/health")).json();
  assertEquals(health.workingOrders, 0);
});

test("[risk-engine] builds positions from fills and values them at the mark", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  const orders = h.listeners["risk-engine-orders"];
  const fill = (side: string, qty: number, px: number) =>
    orders("orders.filled", {
      userId: "u-1",
      asset: "AAPL",
      side,
      filledQty: qty,
      avgFillPrice: px,
      clientOrderId: "c",
    });
  fill("BUY", 100, 90);
  fill("BUY", 100, 110);
  fill("SELL", 50, 120);
  fill("SELL", 250, 130);

  const one = await (await call("GET", "/positions/u-1")).json();
  assertEquals(one.positions.length, 1);
  assertEquals(one.positions[0].netQty, -100);
  assertEquals(one.positions[0].fillCount, 4);

  const all = await (await call("GET", "/positions")).json();
  assertEquals(Object.keys(all.positions), ["u-1"]);
  assertEquals((await (await call("GET", "/positions/nobody")).json()).positions, []);
});

test("[risk-engine] a flat position keeps no average price", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  const orders = h.listeners["risk-engine-orders"];
  orders("orders.filled", {
    userId: "u-2",
    asset: "AAPL",
    side: "BUY",
    filledQty: 10,
    avgFillPrice: 100,
  });
  orders("orders.filled", {
    userId: "u-2",
    asset: "AAPL",
    side: "SELL",
    filledQty: 10,
    avgFillPrice: 105,
  });
  const pos = (await (await call("GET", "/positions/u-2")).json()).positions[0];
  assertEquals(pos.netQty, 0);
  assertEquals(pos.avgPrice, 0);
  assertEquals(pos.realisedPnl, 50);
});

test("[risk-engine] market ticks update prices and trip the market-move breaker once per cooldown", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  const ticks = h.listeners["risk-engine-ticks"];
  ticks("market.ticks", {
    prices: { AAPL: 100, BAD: -1 },
    openPrices: { AAPL: 100 },
    volumes: { AAPL: 5 },
  });
  assertEquals(h.sent.length, 0);

  ticks("market.ticks", { prices: { AAPL: 120 } });
  assertEquals(topics(), ["orders.kill", "risk.breaker"]);
  assertEquals(h.sent[0].payload.scopeValue, "AAPL");

  ticks("market.ticks", { prices: { AAPL: 125 } });
  assertEquals(h.sent.length, 2);

  const breakers = await (await call("GET", "/breakers")).json();
  assertEquals(breakers.active.length, 1);
  assertEquals(breakers.active[0].type, "market-move");
  assertEquals(breakers.fireCount, 1);
  assertEquals(breakers.history[0].target, "AAPL");

  await vi.advanceTimersByTimeAsync(61_000);
  assertEquals((await (await call("GET", "/breakers")).json()).active.length, 0);
  ticks("market.ticks", { prices: { AAPL: 130 } });
  assertEquals(h.sent.length, 4);
});

test("[risk-engine] the user P&L breaker kills a user's orders after a heavy loss", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  await call("POST", "/test/positions", {
    userId: "u-9",
    symbol: "AAPL",
    netQty: 2_000,
    avgPrice: 100,
  });
  await call("POST", "/test/tick", { prices: { AAPL: 50 }, openPrices: { AAPL: 50 } });

  const kill = h.sent.find((s) => s.topic === "orders.kill");
  assertEquals(kill?.payload.scope, "user");
  assertEquals(kill?.payload.targetUserId, "u-9");
  const breaker = h.sent.find((s) => s.topic === "risk.breaker");
  assertEquals(breaker?.payload.type, "user-pnl");
});

test("[risk-engine] test endpoints reset state and are absent outside test mode", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  await call("POST", "/test/positions", {
    userId: "u-9",
    symbol: "AAPL",
    netQty: 10,
    avgPrice: 100,
    realisedPnl: 5,
  });
  assertEquals((await (await call("GET", "/positions/u-9")).json()).positions[0].realisedPnl, 5);
  assertEquals((await call("POST", "/test/positions", { userId: "u" })).status, 400);
  assertEquals((await call("POST", "/test/tick", { prices: "x" })).status, 400);
  assertEquals((await (await call("POST", "/test/positions/reset")).json()).ok, true);
  assertEquals((await (await call("GET", "/positions")).json()).positions, {});

  await load();
  assertEquals((await call("POST", "/test/positions/reset")).status, 404);
});

test("[risk-engine] breakers can be disabled", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  await call("PUT", "/config", { breakersEnabled: false });
  await call("POST", "/test/tick", { prices: { AAPL: 500 }, openPrices: { AAPL: 100 } });
  assertEquals(h.sent.length, 0);
});

test("[risk-engine] config updates are clamped in test mode", async () => {
  await load({ RISK_ENGINE_TEST_MODE: "1" });
  const res = await call("PUT", "/config", {
    fatFingerPct: 0,
    maxOpenOrders: 0,
    duplicateWindowMs: 1,
    maxOrdersPerSecond: 0,
    maxAdvPct: 0,
    maxGrossNotional: -5,
    maxDailyLoss: -10,
    maxConcentrationPct: 500,
    haltMovePercent: 0,
    breakerCooldownMs: 1,
    breakersEnabled: true,
    selfCrossEnabled: false,
    marketHoursEnforced: true,
  });
  const body = await res.json();
  assertEquals(body.fatFingerPct, 0.1);
  assertEquals(body.maxOpenOrders, 1);
  assertEquals(body.duplicateWindowMs, 50);
  assertEquals(body.maxOrdersPerSecond, 1);
  assertEquals(body.maxAdvPct, 0.1);
  assertEquals(body.maxGrossNotional, 0);
  assertEquals(body.maxDailyLoss, -10);
  assertEquals(body.maxConcentrationPct, 100);
  assertEquals(body.haltMovePercent, 0.1);
  assertEquals(body.breakerCooldownMs, 1_000);
  assertEquals(body.selfCrossEnabled, false);
  assertEquals(body.marketHoursEnforced, true);

  assertEquals((await call("PUT", "/config", { maxDailyLoss: 5 })).status, 400);
  assertEquals((await call("PUT", "/config", { fatFingerPct: "x" })).status, 400);
});

test("[risk-engine] config updates are persisted with their author and reason", async () => {
  await load();
  h.store.save.mockResolvedValue({ id: 9, config: { fatFingerPct: 2 } });
  const body = await (
    await call("PUT", "/config?by=alice&reason=tighten", { fatFingerPct: 2 })
  ).json();
  assertEquals(body.version, 9);
  assertEquals(body.fatFingerPct, 2);
  assertEquals(h.store.save.mock.calls[0][1], { createdBy: "alice", reason: "tighten" });

  await call("PUT", "/config", { fatFingerPct: 3 }, { "x-veta-user": "bob" });
  assertEquals(h.store.save.mock.calls[1][1], { createdBy: "bob", reason: undefined });
  await call("PUT", "/config", { fatFingerPct: 3 });
  assertEquals(h.store.save.mock.calls[2][1].createdBy, "unknown");
});

test("[risk-engine] serves config history with a bounded limit", async () => {
  await load();
  assertEquals((await (await call("GET", "/config/history?limit=9999")).json()).history, [
    { id: 1 },
  ]);
  assertEquals(h.store.history.mock.calls[0][0], 200);
  await call("GET", "/config/history?limit=0");
  assertEquals(h.store.history.mock.calls[1][0], 1);
  await call("GET", "/config/history");
  assertEquals(h.store.history.mock.calls[2][0], 50);
});
