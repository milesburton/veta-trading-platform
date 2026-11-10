import { afterAll, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Promise<Response>;
type MessageHandler = (topic: string, value: unknown) => unknown;

const h = vi.hoisted(() => ({
  handler: undefined as undefined | ((req: Request) => Promise<Response>),
  consumers: new Map<string, (topic: string, value: unknown) => unknown>(),
  rules: [] as Array<[RegExp, (params: unknown[]) => unknown[][]]>,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  failSql: undefined as RegExp | undefined,
  send: vi.fn(),
  appendAudit: vi.fn(),
  listAudit: vi.fn(),
  firstBrokenSeq: vi.fn(),
  auditHead: vi.fn(),
  latency: vi.fn(),
}));

const fakeClient = () => ({
  queryArray: (sql: string, params: unknown[] = []) => {
    h.queries.push({ sql, params });
    if (h.failSql?.test(sql)) return Promise.reject(new Error("db failure"));
    const rule = h.rules.find(([pattern]) => pattern.test(sql));
    return Promise.resolve({ rows: rule ? rule[1](params) : [], rowCount: 2 });
  },
  release: () => undefined,
});

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/db", () => ({
  journalPool: { connect: () => Promise.resolve(fakeClient()) },
  auditPool: {},
}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () => Promise.resolve({ send: h.send }),
  createConsumer: (group: string) =>
    Promise.resolve({
      onMessage: (fn: MessageHandler) => {
        h.consumers.set(group, fn);
      },
    }),
}));
vi.mock("../lib/audit.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  appendAudit: h.appendAudit,
  listAudit: h.listAudit,
  firstBrokenSeq: h.firstBrokenSeq,
  auditHead: h.auditHead,
}));
vi.mock("../journal/latency-metrics.ts", () => ({ computeLatencyMetrics: h.latency }));

const fetchMock = vi.fn();

vi.useFakeTimers();
vi.stubGlobal("fetch", fetchMock);
vi.stubEnv("JOURNAL_RETENTION_DAYS", "2");
h.rules.push([/SELECT COUNT\(\*\) FROM journal\.events/, () => [[5]]]);
h.send.mockResolvedValue(undefined);
h.latency.mockResolvedValue({ stages: [] });
fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));

await import("../journal/journal-server.ts");
await vi.waitFor(() => assert(h.handler && h.consumers.size >= 3));

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const call = (path: string, init: RequestInit = {}) => {
  assert(h.handler);
  return h.handler(new Request(`http://journal${path}`, init));
};

const json = async (res: Response) => await res.json();

const when = (pattern: RegExp, rows: (params: unknown[]) => unknown[][]) => {
  h.rules.unshift([pattern, rows]);
};

beforeEach(() => {
  h.queries.length = 0;
  h.rules.splice(0, h.rules.length - 1);
  h.failSql = undefined;
  h.send.mockClear();
  h.appendAudit.mockReset().mockResolvedValue(undefined);
});

const JOURNAL_ROW: unknown[] = [
  1,
  "orders.child:c1",
  "orders.child",
  new Date(1000),
  "u1",
  "TWAP",
  "AAPL",
  "BUY",
  "o1",
  "c1",
  10,
  150,
  null,
  null,
  151,
  null,
  null,
  null,
];

test("[journal] answers preflight, health, latency metrics and unknown routes", async () => {
  assertEquals((await call("/x", { method: "OPTIONS" })).status, 204);
  assertEquals((await json(await call("/health"))).retentionDays, 2);
  await call("/metrics/latency?windowMs=5");
  assertEquals(h.latency.mock.calls.at(-1)?.[0], 1000);
  await call("/metrics/latency?windowMs=999999999999");
  assertEquals(h.latency.mock.calls.at(-1)?.[0], 86_400_000);
  assertEquals((await call("/nope")).status, 404);
});

test("[journal] serves audit pages with sanitised paging arguments", async () => {
  h.listAudit.mockResolvedValue([{ seq: 1 }]);
  assertEquals(await json(await call("/audit?limit=5&beforeSeq=9&actorId=u1")), [{ seq: 1 }]);
  assertEquals(h.listAudit.mock.calls.at(-1)?.[1], { limit: 5, beforeSeq: 9, actorId: "u1" });
  await call("/audit?beforeSeq=-3");
  assertEquals(h.listAudit.mock.calls.at(-1)?.[1].beforeSeq, undefined);
});

test("[journal] verifies the audit chain and reports its head", async () => {
  h.firstBrokenSeq.mockResolvedValueOnce(null).mockResolvedValueOnce(4);
  assertEquals(await json(await call("/audit/verify")), { ok: true, brokenSeq: null });
  assertEquals(await json(await call("/audit/verify")), { ok: false, brokenSeq: 4 });

  h.auditHead.mockResolvedValue({ head: null, at: null });
  await call("/audit/head?seq=7");
  assertEquals(h.auditHead.mock.calls.at(-1)?.[1], 7);
  await call("/audit/head?seq=x");
  assertEquals(h.auditHead.mock.calls.at(-1)?.[1], undefined);
});

test("[journal] filters the journal listing and estimates the total", async () => {
  when(/FROM journal\.events WHERE ts >= \$1/, () => [JOURNAL_ROW]);
  when(/reltuples/, () => [[500]]);
  const body = await json(
    await call("/journal?userId=u1&instrument=AAPL&orderId=o1&algo=TWAP&limit=5000&offset=2")
  );
  assertEquals([body.total, body.limit, body.offset], [500, 1000, 2]);
  assertEquals(body.entries[0].ts, 1000);
  assertEquals(body.entries[0].raw.childId, "c1");
  const select = h.queries.find((q) => q.sql.includes("FROM journal.events WHERE ts >= $1"));
  assertEquals(select?.params.slice(2), ["u1", "AAPL", "o1", "TWAP", 1000, 2]);
});

test("[journal] rebuilds raw payloads for fills and falls back to stored ones", async () => {
  const fill = [...JOURNAL_ROW];
  fill[2] = "orders.filled";
  fill[13] = 10;
  fill[16] = null;
  const other = [...JOURNAL_ROW];
  other[2] = "orders.submitted";
  const stored = [...JOURNAL_ROW];
  stored[17] = { kept: true };
  when(/WHERE order_id = \$1 ORDER BY ts ASC/, () => [fill, other, stored]);
  const body = await json(await call("/journal/order/o1"));
  assertEquals(body.entries[0].raw.filledQty, 10);
  assertEquals(body.entries[1].raw, null);
  assertEquals(body.entries[2].raw, { kept: true });
});

test("[journal] summarises fill progress and rejects undecodable ids", async () => {
  when(/event_type = 'orders\.filled'/, () => [["c1", 5, 100]]);
  const progress = await json(await call("/journal/order/o1/progress"));
  assert(progress.orderId === "o1");
  assertEquals((await call("/journal/order/%E0%A4%A/progress")).status, 400);
});

test("[journal] lists reconstructed orders for a user within a lookback", async () => {
  const structure = [
    "o1",
    "orders.submitted",
    new Date(1000),
    "AAPL",
    "BUY",
    10,
    150,
    "LIMIT",
    "u1",
    null,
    { userId: "u1" },
  ];
  when(/event_type IN \('orders\.submitted'/, () => [structure]);
  const mine = await json(await call("/orders?userId=u1&lookbackMs=60000&limit=10"));
  assertEquals(mine.length, 1);
  const none = await json(await call("/orders?userId=someone&lookbackMs=-1"));
  assertEquals(none, []);
});

test("[journal] runs grid queries over orders and executions", async () => {
  const structure = [
    "o1",
    "orders.submitted",
    new Date(1000),
    "AAPL",
    "BUY",
    10,
    150,
    "LIMIT",
    "u1",
    null,
    null,
  ];
  when(/event_type IN \('orders\.submitted'/, () => [structure]);
  const group = { kind: "group", id: "g", join: "AND", rules: [] };
  const post = (body: unknown, raw = false) =>
    call("/grid/query", {
      method: "POST",
      body: raw ? (body as string) : JSON.stringify(body),
      headers: { "x-user-id": "u1" },
    });

  assertEquals((await post("{nope", true)).status, 400);
  assertEquals((await post({ gridId: "orderBlotter" })).status, 400);
  const orders = await json(
    await post({
      gridId: "orderBlotter",
      filterExpr: group,
      sortField: "asset",
      sortDir: "asc",
      limit: 9999,
      offset: -4,
    })
  );
  assertEquals(orders.total, 1);
  const executions = await json(await post({ gridId: "executions", filterExpr: group }));
  assertEquals(executions.rows, []);
  assertEquals(h.send.mock.calls.at(-1)?.[0], "grid.query");
});

test("[journal] reports data depth from candle history", async () => {
  when(/FROM journal\.candles/, () => [
    ["AAPL", 100, new Date(0), new Date(86_400_000 * 3)],
    ["MSFT", 50, 0, 86_400_000],
  ]);
  const depth = await json(await call("/data-depth"));
  assertEquals(depth.totalSymbols, 2);
  assertEquals(depth.minDays, 1);
  assertEquals(depth.avgDays, 2);
});

test("[journal] reconciles missing executions with per-execution quantities", async () => {
  const exec = (clOrdId: string, execId: string, cumQty: number) => ({
    execId,
    clOrdId,
    origClOrdId: "o1",
    symbol: "AAPL",
    side: "2",
    cumQty,
    avgPx: 10,
    lastQty: 5,
    lastPx: 10 + cumQty,
    leavesQty: 0,
    commission: 1,
    ts: 5,
  });
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify([
        exec("c1", "e1", 5),
        exec("c1", "e2", 10),
        exec("c2", "e1", 5),
        exec("c2", "e2", 10),
      ]),
      { status: 200 }
    )
  );
  when(/SELECT event_id/, () => [["orders.filled:c1:e1"]]);
  await vi.advanceTimersByTimeAsync(5_000);
  await vi.advanceTimersByTimeAsync(100);
  const inserted = h.queries.filter((q) => q.sql.includes("INSERT INTO journal.events"));
  assertEquals(
    inserted.map((q) => [q.params[0], q.params[11], q.params[12]]),
    [
      ["orders.filled:c1:e2", 20, 5],
      ["orders.filled:c2:e1", 15, 5],
      ["orders.filled:c2:e2", 20, 5],
    ]
  );
});

test("[journal] writes consumed events to the journal in batches", async () => {
  const consume = h.consumers.get("journal-group");
  assert(consume);
  consume("orders.child", { childId: "c1", orderId: "o1", ts: 5, quantity: 3 });
  consume("orders.submitted", { orderId: "o2" });
  await vi.advanceTimersByTimeAsync(100);
  const inserts = h.queries.filter((q) => q.sql.includes("INSERT INTO journal.events"));
  assertEquals(inserts.length, 2);
  assert(h.queries.some((q) => q.sql === "COMMIT"));
});

test("[journal] keeps every partial fill of a child and retains the full payload", async () => {
  const consume = h.consumers.get("journal-group");
  assert(consume);
  const fill = { childId: "c1", parentOrderId: "o1", filledQty: 5, algoId: "VETA-TWAP" };
  consume("orders.filled", { ...fill, execId: "EX-1" });
  consume("orders.filled", { ...fill, execId: "EX-2" });
  consume("orders.child", { childId: "c1", orderId: "o1", algo: "TWAP" });
  await vi.advanceTimersByTimeAsync(100);
  const inserts = h.queries.filter((q) => q.sql.includes("INSERT INTO journal.events"));
  const ids = inserts.map((q) => q.params[0]);
  assertEquals(ids, ["orders.filled:c1:EX-1", "orders.filled:c1:EX-2", "orders.child:c1"]);
  assertEquals((inserts[0].params[16] as Record<string, unknown>).algoId, "VETA-TWAP");
  assertEquals((inserts[2].params[16] as Record<string, unknown>).algo, "TWAP");
});

test("[journal] rolls back a failed batch without crashing", async () => {
  h.failSql = /INSERT INTO journal\.events/;
  h.consumers.get("journal-group")?.("orders.child", { childId: "c9" });
  await vi.advanceTimersByTimeAsync(100);
  assert(h.queries.some((q) => q.sql === "ROLLBACK"));
});

test("[journal] prunes old events after a write and on its schedule", async () => {
  h.consumers.get("journal-group")?.("orders.child", { childId: "c10" });
  await vi.advanceTimersByTimeAsync(6_000);
  await vi.advanceTimersByTimeAsync(31_000);
  assert(h.queries.some((q) => q.sql.includes("DELETE FROM journal.events")));
  assert(h.queries.some((q) => q.sql.includes("VACUUM")));
});

test("[journal] reports a failed prune without crashing", async () => {
  h.failSql = /DELETE FROM journal\.events/;
  await vi.advanceTimersByTimeAsync(3_700_000);
  assert(h.queries.some((q) => q.sql.includes("DELETE FROM journal.events")));
});

test("[journal] persists audit events and drops malformed ones", async () => {
  const audit = h.consumers.get("journal-audit");
  assert(audit);
  await audit("audit.events", { actorId: "u1", actorRole: "admin", action: "x" });
  assertEquals(h.appendAudit.mock.calls.length, 1);
  await audit("audit.events", { nope: true });
  assertEquals(h.appendAudit.mock.calls.length, 1);
});

test("[journal] retries a failing audit write and then gives up", async () => {
  const audit = h.consumers.get("journal-audit");
  assert(audit);
  h.appendAudit.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(undefined);
  const retried = audit("audit.events", { actorId: "u1", actorRole: "admin", action: "x" });
  await vi.advanceTimersByTimeAsync(300);
  await retried;
  assertEquals(h.appendAudit.mock.calls.length, 2);

  h.appendAudit.mockReset().mockRejectedValue(new Error("down"));
  const abandoned = audit("audit.events", { actorId: "u1", actorRole: "admin", action: "y" });
  await vi.advanceTimersByTimeAsync(2_000);
  await abandoned;
  assertEquals(h.appendAudit.mock.calls.length, 3);
});

test("[journal] ingests market ticks into candles", async () => {
  const ticks = h.consumers.get("journal-market");
  assert(ticks);
  await ticks("market.ticks", { prices: { AAPL: 100 }, volumes: { AAPL: 5 } });
  const inserts = h.queries.filter((q) => q.sql.includes("INSERT INTO journal.candles"));
  assertEquals(
    inserts.map((q) => q.params[1]),
    ["1m", "5m"]
  );
  for (const { params } of inserts) {
    assertEquals([params[0], params[3], params[4]], [["AAPL"], [100], [5 / 240]]);
  }
  assert(h.queries.some((q) => q.sql === "COMMIT"));
});
