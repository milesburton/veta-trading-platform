import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;
type Listener = (topic: string, raw: unknown) => void;

const captured = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  listeners: {} as Record<string, Listener>,
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
  createConsumer: (group: string) =>
    Promise.resolve({
      onMessage: (fn: Listener) => {
        captured.listeners[group] = fn;
      },
    }),
}));

async function call(path: string, method = "GET") {
  assert(captured.handler);
  return captured.handler(new Request(`http://ccp${path}`, { method }));
}

async function json(path: string) {
  return (await call(path)).json();
}

async function fill(extra: Record<string, unknown> = {}) {
  captured.listeners["ccp-fills"]("orders.filled", {
    execId: "e-1",
    userId: "u-1",
    asset: "AAPL",
    side: "BUY",
    filledQty: 100,
    avgFillPrice: 100,
    counterparty: "XNAS",
    settlementDate: "2099-01-01",
    ...extra,
  });
  await vi.advanceTimersByTimeAsync(0);
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  await import("../ccp/ccp-service.ts");
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  captured.sent.length = 0;
});

test("[ccp] serves health and preflight and rejects unknown routes", async () => {
  assertEquals(await json("/health"), { service: "ccp-service", version: "dev", status: "ok" });
  assertEquals((await call("/ccp/stats", "OPTIONS")).status, 204);
  assertEquals((await call("/nope")).status, 404);
});

test("[ccp] unknown users have an empty margin account", async () => {
  const acct = await json("/ccp/margin/ghost");
  assertEquals(acct.userId, "ghost");
  assertEquals(acct.initialMarginPosted, 0);
  assertEquals(acct.positions, {});
});

test("[ccp] ignores incomplete fills and RFQ executions", async () => {
  captured.listeners["ccp-fills"]("orders.filled", { execId: "x" });
  captured.listeners["ccp-fills"]("orders.filled", {
    execId: "x",
    userId: "u",
    asset: "A",
    filledQty: -5,
    avgFillPrice: 1,
  });
  captured.listeners["ccp-rfq"]("rfq.executed", { execId: "x" });
  await vi.advanceTimersByTimeAsync(0);
  assertEquals(captured.sent.length, 0);
  assertEquals((await json("/ccp/stats")).totalNovated, 0);
});

test("[ccp] novates a fill, queues settlement and posts initial margin", async () => {
  await fill();

  assertEquals(
    captured.sent.map((s) => s.topic),
    ["ccp.novation", "ccp.settlement.queued", "ccp.margin"],
  );
  const novation = captured.sent[0].payload;
  assertEquals(novation.ccpCounterparty, "VETA-CCP");
  assertEquals(novation.originalCounterparty, "XNAS");
  assertEquals(novation.notional, 10_000);
  assertEquals(novation.desk, "equity");
  assertEquals(captured.sent[2].payload.marginRequired, 1_000);

  const acct = await json("/ccp/margin/u-1");
  assertEquals(acct.initialMarginPosted, 1_000);
  assertEquals(acct.positions, { AAPL: 100 });
  assertEquals(acct.costBasis, { AAPL: 100 });
});

test("[ccp] defaults the settlement date to T+2 when a fill has none", async () => {
  await fill({ execId: "e-2", userId: "u-2", settlementDate: undefined });
  const queued = captured.sent.find((s) => s.topic === "ccp.settlement.queued");
  assertEquals(queued?.payload.settlementDate, "2026-10-18");
});

test("[ccp] novates RFQ executions on the otc market with a T+1 default", async () => {
  captured.listeners["ccp-rfq"]("rfq.executed", {
    execId: "r-1",
    userId: "u-3",
    asset: "UST10Y",
    side: "SELL",
    quantity: 10,
    price: 99,
    notional: 990,
    dealerId: "GSCO",
  });
  await vi.advanceTimersByTimeAsync(0);

  const novation = captured.sent.find((s) => s.topic === "ccp.novation");
  assertEquals(novation?.payload.marketType, "otc");
  assertEquals(novation?.payload.desk, "fi");
  assertEquals(novation?.payload.originalCounterparty, "GSCO");
  assertEquals(novation?.payload.settlementDate, "2026-10-17");
  assertEquals(captured.sent.find((s) => s.topic === "ccp.margin")?.payload.marginRequired, 19.8);
});

test("[ccp] lists pending settlements, filtered by user and by date", async () => {
  const all = await json("/ccp/settlements");
  assertEquals(all.total, 3);
  assertEquals(
    all.obligations.map((o: { settlementDate: string }) => o.settlementDate),
    ["2026-10-17", "2026-10-18", "2099-01-01"],
  );
  assertEquals((await json("/ccp/settlements?userId=u-2")).total, 1);

  const byDate = await json("/ccp/settlements/2099-01-01");
  assertEquals(byDate.date, "2099-01-01");
  assertEquals(byDate.total, 1);
  assertEquals((await json("/ccp/settlements/2099-01-01?userId=other")).total, 0);

  const stats = await json("/ccp/stats");
  assertEquals(stats.totalNovated, 3);
  assertEquals(stats.pendingObligations, 3);
  assertEquals(stats.pendingByDate["2099-01-01"], 1);
  assertEquals(stats.marginAccountCount, 3);
});

test("[ccp] mark to market calls variation margin when losses breach maintenance", async () => {
  captured.prices = { AAPL: 85 };
  await vi.advanceTimersByTimeAsync(10_000);

  const call = captured.sent.find(
    (s) => s.topic === "ccp.margin" && s.payload.type === "variation",
  );
  assertEquals(call?.payload.userId, "u-1");
  assertEquals(call?.payload.unrealisedPnl, -1_500);
  assertEquals(call?.payload.variationCall, 1_500);
  assertEquals((await json("/ccp/margin/u-1")).unrealisedPnl, -1_500);
});

test("[ccp] mark to market stays quiet when prices hold", async () => {
  captured.sent.length = 0;
  captured.prices = { AAPL: 100 };
  await vi.advanceTimersByTimeAsync(10_000);
  assertEquals(
    captured.sent.filter((s) => s.payload.userId === "u-1" && s.payload.type === "variation")
      .length,
    0,
  );
});

test("[ccp] the settlement sweep settles due obligations and releases margin", async () => {
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  captured.sent.length = 0;
  await vi.advanceTimersByTimeAsync(30_000);

  const completed = captured.sent.filter((s) => s.topic === "ccp.settlement.complete");
  assertEquals(completed.length, 1);
  assertEquals(completed[0].payload.userId, "u-3");

  const acct = await json("/ccp/margin/u-3");
  assertEquals(acct.initialMarginPosted, 0);
  assertEquals(acct.positions, {});

  const stats = await json("/ccp/stats");
  assertEquals(stats.totalSettled, 1);
  assertEquals(stats.pendingObligations, 2);
});

test("[ccp] a partially settled position keeps its remaining quantity", async () => {
  vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  captured.sent.length = 0;
  await fill({ execId: "e-9", userId: "u-9", filledQty: 10, settlementDate: "2026-10-19" });
  await fill({ execId: "e-10", userId: "u-9", filledQty: 5, settlementDate: "2099-01-01" });
  assertEquals((await json("/ccp/margin/u-9")).positions, { AAPL: 15 });

  await vi.advanceTimersByTimeAsync(30_000);
  assertEquals((await json("/ccp/margin/u-9")).positions, { AAPL: 5 });
});
