import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

type TopicHandler = (payload: unknown) => Promise<void>;

const h = vi.hoisted(() => ({
  handlers: {} as Record<string, TopicHandler>,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
  omsActiveByOrderId: {} as Record<string, boolean>,
  gateRequests: [] as string[],
  gateFails: false,
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: vi.fn(),
}));
vi.mock("#veta/market-client", () => ({
  createMarketSimClient: () => ({
    start: () => {},
    getLatest: () => ({
      prices: { AAPL: 190 },
      volumes: { AAPL: 50_000 },
      venueBooks: undefined,
    }),
  }),
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () =>
    Promise.resolve({
      send: (topic: string, payload: Record<string, unknown>) => {
        h.sent.push({ topic, payload });
        return Promise.resolve();
      },
    }),
  createTypedConsumer: (
    _group: string,
    defs: Array<{
      topic: string;
      handler: (payload: unknown) => Promise<void>;
    }>
  ) => {
    for (const d of defs) h.handlers[d.topic] = d.handler;
    return Promise.resolve({});
  },
}));

function gateFetch(input: string | URL): Promise<Response> {
  if (h.gateFails) return Promise.reject(new Error("oms unavailable"));
  const url = new URL(String(input));
  h.gateRequests.push(url.toString());
  if (url.pathname === "/orders/active") {
    const orderId = url.searchParams.get("orderId") ?? "";
    const active = h.omsActiveByOrderId[orderId] ?? false;
    return Promise.resolve(new Response(JSON.stringify({ active }), { status: 200 }));
  }
  return Promise.resolve(new Response("{}", { status: 404 }));
}

async function load() {
  vi.resetModules();
  h.handlers = {};
  h.sent = [];
  h.omsActiveByOrderId = {};
  h.gateRequests = [];
  h.gateFails = false;
  await import("../ems/ems-server.ts");
}

function child(overrides: Record<string, unknown> = {}) {
  return {
    childId: "c-1",
    parentOrderId: "oms-1",
    clientOrderId: "co-1",
    userId: "trader-1",
    algo: "TWAP",
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    ts: Date.now(),
    ...overrides,
  };
}

function topics(): string[] {
  return h.sent.map((s) => s.topic);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
  vi.stubGlobal("fetch", gateFetch);
  await load();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("[ems] fills child orders only when OMS confirms the parent is active", async () => {
  h.omsActiveByOrderId["oms-1"] = true;
  await h.handlers["orders.child"](child());
  assertEquals(topics().includes("orders.filled"), true);
  assertEquals(topics().includes("fix.execution"), true);
  assertEquals(h.gateRequests.length, 1);
  assertEquals(h.gateRequests[0].includes("orderId=oms-1"), true);
});

test("[ems] suppresses a child that arrives before its cancellation message when OMS marks parent inactive", async () => {
  h.omsActiveByOrderId["oms-2"] = false;
  await h.handlers["orders.child"](
    child({ childId: "c-2", parentOrderId: "oms-2", clientOrderId: "co-2" })
  );
  await h.handlers["orders.cancelled"]({
    orderId: "oms-2",
    clientOrderId: "co-2",
    userId: "trader-1",
    issuedBy: "trader-1",
    issuedByRole: "trader",
    ts: Date.now(),
  });

  assertEquals(topics().includes("orders.filled"), false);
  assertEquals(topics().includes("fix.execution"), false);
  assertEquals(h.gateRequests.length, 1);
});

test("[ems] fails closed when the OMS active-order gate is unavailable", async () => {
  h.gateFails = true;
  await h.handlers["orders.child"](child({ childId: "c-3", parentOrderId: "oms-3" }));
  assertEquals(topics().includes("orders.filled"), false);
  assertEquals(topics().includes("fix.execution"), false);
});
