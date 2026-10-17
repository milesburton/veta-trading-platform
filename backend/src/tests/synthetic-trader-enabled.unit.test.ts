import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;
type Handlers = Record<string, (arg: unknown) => void>;

const h = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  handlers: {} as Handlers,
  socketReady: { value: true },
  submitted: [] as unknown[],
  authenticated: [] as string[],
  connects: { count: 0 },
  tokenStart: undefined as undefined | ((token: string) => void),
  decide: vi.fn(),
  deskOpen: { value: true },
  engineConfig: undefined as unknown,
  prices: { value: { AAPL: 100 } as unknown },
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
}));
vi.mock("../synthetic-trader/gateway-socket.ts", () => ({
  GatewaySocket: class {
    constructor(_url: string, handlers: Handlers) {
      h.handlers = handlers;
    }
    get isReady() {
      return h.socketReady.value;
    }
    connect() {
      h.connects.count += 1;
    }
    authenticate(token: string) {
      h.authenticated.push(token);
    }
    submitOrder(order: unknown) {
      h.submitted.push(order);
    }
  },
}));
vi.mock("../synthetic-trader/token-client.ts", () => ({
  TokenClient: class {
    start(cb: (token: string) => void) {
      h.tokenStart = cb;
    }
  },
}));
vi.mock("../synthetic-trader/decision-engine.ts", () => ({
  DecisionEngine: class {
    constructor(config: unknown) {
      h.engineConfig = config;
    }
    decide = h.decide;
  },
}));
vi.mock("../synthetic-trader/desk-calendar.ts", () => ({ isDeskOpen: () => h.deskOpen.value }));
vi.mock("../synthetic-trader/pacing.ts", () => ({ nextDelayMs: () => 1_000 }));

class ExitSignal extends Error {
  code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

async function load(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  h.submitted.length = 0;
  h.authenticated.length = 0;
  h.connects.count = 0;
  await import("../synthetic-trader/synthetic-trader.ts");
  await vi.advanceTimersByTimeAsync(0);
}

const ORDER = { asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 100, desk: "equity" };
const ENABLED = {
  SYNTHETIC_TRADER_ENABLED: "true",
  SYNTHETIC_TRADER_PASSWORD: "pw",
  SYNTHETIC_TRADER_DRY_RUN: "false",
  SYNTHETIC_TRADER_SYMBOLS: "AAPL, MSFT",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  h.socketReady.value = true;
  h.deskOpen.value = true;
  h.prices.value = { AAPL: 100 };
  h.decide.mockReset();
  h.decide.mockReturnValue({ kind: "skip", skippedReason: "nothing to do" });
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(h.prices.value))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("[synthetic-trader] exits when enabled without a password", async () => {
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ExitSignal(Number(code ?? 0));
  });
  vi.resetModules();
  vi.stubEnv("SYNTHETIC_TRADER_ENABLED", "true");
  vi.stubEnv("SYNTHETIC_TRADER_PASSWORD", "");
  let caught: unknown;
  await import("../synthetic-trader/synthetic-trader.ts").catch((err) => (caught = err));
  assert(caught instanceof ExitSignal);
  assertEquals(caught.code, 1);
});

test("[synthetic-trader] serves health and boots the engine with the configured symbols", async () => {
  await load(ENABLED);
  assert(h.handler);
  const health = await h.handler(new Request("http://st/health"));
  assertEquals((await health.json()).service, "synthetic-trader");
  assertEquals((await h.handler(new Request("http://st/x"))).status, 404);

  assertEquals((h.engineConfig as { symbols: string[] }).symbols, ["AAPL", "MSFT"]);
  assertEquals(h.connects.count, 1);
  h.tokenStart?.("tok-1");
  assertEquals(h.authenticated, ["tok-1"]);
});

test("[synthetic-trader] submits an order when the desk is open and the cap allows", async () => {
  await load(ENABLED);
  h.decide.mockReturnValue({ kind: "order", order: ORDER });
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.submitted, [ORDER]);
});

test("[synthetic-trader] dry run logs instead of submitting", async () => {
  await load({ ...ENABLED, SYNTHETIC_TRADER_DRY_RUN: "true" });
  h.decide.mockReturnValue({ kind: "order", order: ORDER });
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.submitted.length, 0);
});

test("[synthetic-trader] skips ticks when the socket is down, the desk is closed or the cap is hit", async () => {
  await load(ENABLED);
  h.decide.mockReturnValue({ kind: "order", order: ORDER });

  h.socketReady.value = false;
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.decide.mock.calls.length, 0);
  h.socketReady.value = true;

  h.deskOpen.value = false;
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.submitted.length, 0);
  h.deskOpen.value = true;

  h.decide.mockReturnValue({ kind: "order", order: { ...ORDER, quantity: 6_000 } });
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.submitted.length, 0);
});

test("[synthetic-trader] the daily notional cap accumulates and resets the next day", async () => {
  await load(ENABLED);
  h.decide.mockReturnValue({ kind: "order", order: { ...ORDER, quantity: 3_000 } });
  await vi.advanceTimersByTimeAsync(1_000);
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.submitted.length, 1);

  vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
  await vi.advanceTimersByTimeAsync(1_000);
  assertEquals(h.submitted.length, 2);
});

test("[synthetic-trader] refreshes prices and keeps the last good ones on bad payloads", async () => {
  await load(ENABLED);
  const priceNow = async () => {
    await vi.advanceTimersByTimeAsync(1_000);
    const lookup = h.decide.mock.calls.at(-1)?.[1] as (symbol: string) => number | undefined;
    assert(lookup);
    return lookup("AAPL");
  };
  assertEquals(await priceNow(), 100);

  h.prices.value = { AAPL: 150 };
  await vi.advanceTimersByTimeAsync(15_000);
  assertEquals(await priceNow(), 150);

  h.prices.value = { not: "numbers" };
  await vi.advanceTimersByTimeAsync(15_000);
  assertEquals(await priceNow(), 150);

  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  await vi.advanceTimersByTimeAsync(15_000);
  assertEquals(await priceNow(), 150);

  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
  await vi.advanceTimersByTimeAsync(15_000);
  assertEquals(await priceNow(), 150);
});

test("[synthetic-trader] reacts to gateway events and logs the hourly summary", async () => {
  await load(ENABLED);
  h.handlers.onAuthIdentity({ user: { id: "synthetic-trader-1", role: "trader" }, limits: {} });
  h.handlers.onAuthError("bad token");
  h.handlers.onOrderAck({
    clientOrderId: "c-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: 100,
    strategy: "LIMIT",
  });
  h.handlers.onOrderRejected({ clientOrderId: "c-1", reason: "nope" });
  h.handlers.onOrderEvent({
    topic: "orders.filled",
    data: { clientOrderId: "c-2", filledQty: 5, remainingQty: 0 },
  });
  h.handlers.onOrderEvent({ topic: "orders.cancelled", data: { clientOrderId: "c-2" } });
  h.handlers.onOrderEvent({ topic: "orders.filled", data: { garbage: true } });
  h.handlers.onOrderEvent({ topic: "other.topic", data: {} });
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  assertEquals(h.connects.count, 1);
});
