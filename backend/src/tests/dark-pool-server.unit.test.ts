import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;
type Listener = (topic: string, raw: unknown) => void;

const captured = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  listener: undefined as undefined | Listener,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
  prices: {} as Record<string, number>,
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    captured.handler = handler;
  },
}));
vi.mock("#veta/market-client", () => ({
  createMarketSimClient: () => ({
    start: () => {},
    getLatest: () => ({ prices: captured.prices }),
  }),
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () =>
    Promise.resolve({
      send: (topic: string, payload: Record<string, unknown>) => {
        captured.sent.push({ topic, payload });
        return Promise.resolve();
      },
    }),
  createConsumer: () =>
    Promise.resolve({
      onMessage: (fn: Listener) => {
        captured.listener = fn;
      },
    }),
}));

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  captured.sent.length = 0;
  captured.prices = {};
  await import("../dark-pool/dark-pool-server.ts");
}

async function stats() {
  assert(captured.handler);
  return (await captured.handler(new Request("http://dp/pool/stats"))).json();
}

function route(overrides: Record<string, unknown>) {
  assert(captured.listener);
  captured.listener("orders.routed", {
    orderId: "o-1",
    userId: "u-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 20_000,
    limitPrice: 101,
    strategy: "LIMIT",
    destinationVenue: "DARK1",
    marketType: "dark",
    ts: 0,
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("[dark-pool] serves health and preflight and rejects unknown routes", async () => {
  await load();
  assert(captured.handler);
  const health = await captured.handler(new Request("http://dp/health"));
  assertEquals(await health.json(), { service: "dark-pool", version: "dev", status: "ok" });
  assertEquals(
    (await captured.handler(new Request("http://dp/x", { method: "OPTIONS" }))).status,
    204
  );
  assertEquals((await captured.handler(new Request("http://dp/x"))).status, 404);
});

test("[dark-pool] admits only well-formed dark block orders for DARK1", async () => {
  await load();
  route({ destinationVenue: "XNAS" });
  route({ marketType: "lit" });
  route({ limitPrice: 0 });
  route({ quantity: 9_999 });
  assertEquals((await stats()).currentDepth, {});

  route({ orderId: "ok-1" });
  route({ orderId: "ok-2", side: "SELL", quantity: 5_000_000 });
  assertEquals((await stats()).currentDepth, {
    AAPL: { buys: 1, sells: 1, buyQty: 20_000, sellQty: 5_000_000 },
  });
});

test("[dark-pool] matches crossing orders at the midpoint and publishes the executions", async () => {
  await load();
  captured.prices = { AAPL: 100 };
  route({ orderId: "b-1", side: "BUY", quantity: 20_000, limitPrice: 101 });
  route({ orderId: "s-1", side: "SELL", userId: "u-2", quantity: 20_000, limitPrice: 99 });

  await vi.advanceTimersByTimeAsync(500);

  assertEquals(
    captured.sent.map((s) => s.topic),
    ["dark.execution", "orders.filled", "orders.filled", "fix.execution", "fix.execution"]
  );
  assertEquals(captured.sent[0].payload.midPrice, 100);
  assertEquals(captured.sent[0].payload.matchedQty, 20_000);

  const snapshot = await stats();
  assertEquals(snapshot.totalMatchedToday, 1);
  assertEquals(snapshot.totalMatchedAllTime, 1);
  assertEquals(snapshot.currentDepth, {});
});

test("[dark-pool] skips matching when there is no price or no opposite side", async () => {
  await load();
  route({ orderId: "b-1" });
  await vi.advanceTimersByTimeAsync(500);
  assertEquals(captured.sent.length, 0);

  route({ orderId: "s-1", side: "SELL", limitPrice: 99 });
  await vi.advanceTimersByTimeAsync(500);
  assertEquals(captured.sent.length, 0);
  assertEquals((await stats()).currentDepth.AAPL.buys, 1);
});

test("[dark-pool] reroutes timed out residuals to the lit venue by default", async () => {
  await load();
  route({ orderId: "late-1", clientOrderId: "c-1" });
  await vi.advanceTimersByTimeAsync(32_000);

  const rerouted = captured.sent.find((s) => s.topic === "orders.routed");
  assertEquals(rerouted?.payload.orderId, "late-1");
  assertEquals(rerouted?.payload.marketType, "lit");
  assertEquals(rerouted?.payload.destinationVenue, "XNAS");
  assertEquals(rerouted?.payload.reroutedFromDark, true);
  assertEquals(rerouted?.payload.quantity, 20_000);
  assertEquals((await stats()).currentDepth, {});
});

test("[dark-pool] expires timed out residuals when configured to", async () => {
  await load({ RESIDUAL_ACTION: "expire", ORDER_TIMEOUT_MS: "1000" });
  route({ orderId: "late-2" });
  await vi.advanceTimersByTimeAsync(3_000);

  const expired = captured.sent.find((s) => s.topic === "orders.expired");
  assertEquals(expired?.payload.reason, "dark_pool_timeout");
  assertEquals(expired?.payload.remainingQty, 20_000);
  assertEquals(
    captured.sent.some((s) => s.topic === "orders.routed"),
    false
  );
});

test("[dark-pool] resets the daily match counter after UTC midnight", async () => {
  await load();
  captured.prices = { AAPL: 100 };
  route({ orderId: "b-1" });
  route({ orderId: "s-1", side: "SELL", limitPrice: 99 });
  await vi.advanceTimersByTimeAsync(500);
  assertEquals((await stats()).totalMatchedToday, 1);

  vi.setSystemTime(new Date("2026-10-17T00:00:05Z"));
  await vi.advanceTimersByTimeAsync(2_000);
  const snapshot = await stats();
  assertEquals(snapshot.totalMatchedToday, 0);
  assertEquals(snapshot.totalMatchedAllTime, 1);
});
