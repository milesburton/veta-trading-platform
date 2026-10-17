import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

const captured = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  onMessage: undefined as undefined | ((topic: string, raw: unknown) => void),
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    captured.handler = handler;
  },
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
      onMessage: (fn: (topic: string, raw: unknown) => void) => {
        captured.onMessage = fn;
      },
    }),
}));

const BOND = {
  isin: "US912828XX00",
  symbol: "UST10Y",
  description: "10Y Treasury",
  couponRate: 0.04,
  maturityDate: "2036-10-15",
  totalPeriods: 20,
  periodsPerYear: 2,
  faceValue: 100,
  yieldAtOrder: 0.04,
  creditRating: "AAA",
};

function request(side: "BUY" | "SELL", orderId: string) {
  return {
    orderId,
    clientOrderId: `c-${orderId}`,
    userId: "u-1",
    asset: "UST10Y",
    side,
    quantity: 10,
    limitPrice: 100,
    bondSpec: BOND,
    routedAt: 0,
    ts: 0,
  };
}

async function call(method: string, path: string, body?: unknown) {
  assert(captured.handler);
  return captured.handler(
    new Request(`http://rfq${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function ingest(side: "BUY" | "SELL", orderId: string) {
  assert(captured.onMessage);
  captured.onMessage("orders.fi.rfq", request(side, orderId));
  await vi.advanceTimersByTimeAsync(1_500);
}

function topics() {
  return captured.sent.map((s) => s.topic);
}

beforeAll(async () => {
  vi.stubEnv("RFQ_QUOTE_WINDOW_MS", "1000");
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  await import("../rfq/rfq-service.ts");
});

afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  captured.sent.length = 0;
});

test("[rfq-service] answers health, preflight and unknown routes", async () => {
  assertEquals(await (await call("GET", "/health")).json(), {
    service: "rfq-service",
    version: "dev",
    status: "ok",
  });
  assertEquals((await call("OPTIONS", "/rfq")).status, 204);
  assertEquals((await call("GET", "/nowhere")).status, 404);
});

test("[rfq-service] ignores bus messages without a bond spec", async () => {
  assert(captured.onMessage);
  captured.onMessage("orders.fi.rfq", { orderId: "x" });
  await vi.advanceTimersByTimeAsync(1_500);
  assertEquals(captured.sent.length, 0);
});

test("[rfq-service] collects dealer quotes then auto-executes the best one", async () => {
  await ingest("BUY", "o-auto");

  const sequence = topics();
  assertEquals(sequence[0], "rfq.quote.update");
  assert(sequence.includes("rfq.executed"));
  assert(sequence.includes("orders.filled"));
  assert(sequence.includes("fix.execution"));

  const executed = captured.sent.find((s) => s.topic === "rfq.executed");
  assertEquals(executed?.payload.orderId, "o-auto");
  assertEquals(executed?.payload.side, "BUY");

  const list = await (await call("GET", "/rfq?userId=u-1")).json();
  const record = list.rfqs.find((r: { orderId: string }) => r.orderId === "o-auto");
  assertEquals(record.state, "EXECUTED");
  assert(record.quotes.length > 0);
  assertEquals((await call("GET", `/rfq/${record.rfqId}`)).status, 200);
  assertEquals((await call("GET", "/rfq/RFQ99999999")).status, 404);
});

test("[rfq-service] lists RFQs per user and reports statistics", async () => {
  const none = await (await call("GET", "/rfq?userId=nobody")).json();
  assertEquals(none, { rfqs: [], total: 0 });

  const stats = await (await call("GET", "/rfq/stats")).json();
  assertEquals(stats.service, "rfq-service");
  assertEquals(stats.quoteWindowMs, 1000);
  assert(stats.byState.EXECUTED >= 1);
});

test("[rfq-service] expires an RFQ when no dealer responds", async () => {
  vi.mocked(Math.random).mockReturnValue(0.999999);
  await ingest("SELL", "o-none");
  vi.mocked(Math.random).mockReturnValue(0.5);

  const expired = captured.sent.find((s) => s.topic === "orders.expired");
  assertEquals(expired?.payload.orderId, "o-none");
  assertEquals(expired?.payload.reason, "rfq_no_quotes");
  const update = captured.sent.filter((s) => s.topic === "rfq.quote.update").pop();
  assertEquals(update?.payload.state, "NO_QUOTES");
});

test("[rfq-service] manual execution validates the RFQ state and chosen dealer", async () => {
  assertEquals((await call("POST", "/rfq/RFQ99999999/execute")).status, 404);

  const list = await (await call("GET", "/rfq")).json();
  const executed = list.rfqs.find((r: { state: string }) => r.state === "EXECUTED");
  assertEquals((await call("POST", `/rfq/${executed.rfqId}/execute`)).status, 409);

  const noQuotes = list.rfqs.find((r: { state: string }) => r.state === "NO_QUOTES");
  assertEquals((await call("POST", `/rfq/${noQuotes.rfqId}/execute`)).status, 410);
});

test("[rfq-service] manual execution picks the requested dealer quote", async () => {
  assert(captured.onMessage);
  vi.stubEnv("RFQ_QUOTE_WINDOW_MS", "1000");
  captured.onMessage("orders.fi.rfq", request("BUY", "o-manual"));
  await vi.advanceTimersByTimeAsync(200);

  const list = await (await call("GET", "/rfq")).json();
  const pending = list.rfqs.find((r: { orderId: string }) => r.orderId === "o-manual");
  assert(pending.quotes.length > 0);
  const dealerId = pending.quotes[0].dealerId;

  assertEquals(
    (await call("POST", `/rfq/${pending.rfqId}/execute`, { dealerId: "NOPE" })).status,
    404,
  );
  const ok = await call("POST", `/rfq/${pending.rfqId}/execute`, { dealerId });
  assertEquals(ok.status, 200);
  assertEquals((await ok.json()).executedQuote.dealerId, dealerId);
  await vi.advanceTimersByTimeAsync(1_500);
});

test("[rfq-service] manual execution without a body uses the best quote, or waits for one", async () => {
  vi.mocked(Math.random).mockReturnValue(0.999999);
  assert(captured.onMessage);
  captured.onMessage("orders.fi.rfq", request("BUY", "o-early"));
  await vi.advanceTimersByTimeAsync(10);
  const list = await (await call("GET", "/rfq")).json();
  const early = list.rfqs.find((r: { orderId: string }) => r.orderId === "o-early");
  assertEquals((await call("POST", `/rfq/${early.rfqId}/execute`)).status, 425);
  await vi.advanceTimersByTimeAsync(1_500);
  vi.mocked(Math.random).mockReturnValue(0.5);

  captured.onMessage("orders.fi.rfq", request("SELL", "o-best"));
  await vi.advanceTimersByTimeAsync(900);
  const again = await (await call("GET", "/rfq")).json();
  const open = again.rfqs.find((r: { orderId: string }) => r.orderId === "o-best");
  const res = await call("POST", `/rfq/${open.rfqId}/execute`);
  assertEquals(res.status, 200);
  await vi.advanceTimersByTimeAsync(1_500);
});

test("[rfq-service] prunes completed RFQs after the retention window", async () => {
  await vi.advanceTimersByTimeAsync(400_000);
  const stats = await (await call("GET", "/rfq/stats")).json();
  assertEquals(stats.total, 0);
});

test("[rfq-service] sell-side RFQ validates its request body", async () => {
  assertEquals((await call("POST", "/rfq/sellside", undefined)).status, 400);
  const missing = await call("POST", "/rfq/sellside", { clientUserId: "c-1" });
  assertEquals(missing.status, 400);
});

test("[rfq-service] sell-side RFQ flows from request through markup to a confirmed order", async () => {
  const created = await (
    await call("POST", "/rfq/sellside", {
      clientUserId: "c-1",
      asset: "UST10Y",
      side: "BUY",
      quantity: 5,
      limitPrice: 100,
    })
  ).json();
  const id = created.rfqId;
  assertEquals(created.state, "CLIENT_REQUEST");
  assert(topics().includes("rfq.sellside.update"));

  assertEquals((await call("PUT", `/rfq/sellside/${id}/markup`, {})).status, 409);
  assertEquals((await call("PUT", `/rfq/sellside/${id}/route`, {})).status, 400);
  const routed = await (
    await call("PUT", `/rfq/sellside/${id}/route`, { salesUserId: "s-1" })
  ).json();
  assertEquals(routed.state, "SALES_MARKUP");
  assert(routed.dealerBestPrice > 0);

  assertEquals(
    (await call("PUT", `/rfq/sellside/${id}/markup`, { salesUserId: "s-2", markupBps: 10 })).status,
    403,
  );
  const marked = await (
    await call("PUT", `/rfq/sellside/${id}/markup`, { salesUserId: "s-1", markupBps: 10 })
  ).json();
  assertEquals(marked.state, "CLIENT_CONFIRMATION");
  assert(marked.clientQuotedPrice > marked.dealerBestPrice);

  assertEquals(
    (await call("PUT", `/rfq/sellside/${id}/confirm`, { clientUserId: "c-2" })).status,
    403,
  );
  captured.sent.length = 0;
  const confirmed = await (
    await call("PUT", `/rfq/sellside/${id}/confirm`, { clientUserId: "c-1" })
  ).json();
  assertEquals(confirmed.state, "CONFIRMED");
  const order = captured.sent.find((s) => s.topic === "orders.new");
  assertEquals(order?.payload.userRole, "external-client");
  assertEquals(order?.payload.limitPrice, marked.clientQuotedPrice);

  assertEquals((await call("PUT", `/rfq/sellside/${id}/reject`, {})).status, 409);
});

test("[rfq-service] sell-side RFQs can be rejected, fetched, listed and counted", async () => {
  const created = await (
    await call("POST", "/rfq/sellside", {
      clientUserId: "c-9",
      asset: "UST10Y",
      side: "SELL",
      quantity: 1,
    })
  ).json();
  assertEquals((await call("PUT", "/rfq/sellside/SSRFQ999999/route", {})).status, 404);

  const rejected = await (
    await call("PUT", `/rfq/sellside/${created.rfqId}/reject`, {
      rejectedBy: "s-1",
      reason: "no axe",
    })
  ).json();
  assertEquals(rejected.state, "REJECTED");
  assertEquals(rejected.rejectionReason, "no axe");

  assertEquals((await call("GET", `/rfq/sellside/${created.rfqId}`)).status, 200);
  assertEquals((await call("GET", "/rfq/sellside/SSRFQ999999")).status, 404);

  const rejectedOnly = await (await call("GET", "/rfq/sellside?state=REJECTED")).json();
  assertEquals(rejectedOnly.total, 1);
  const forClient = await (await call("GET", "/rfq/sellside?userId=c-1")).json();
  assertEquals(forClient.rfqs[0].clientUserId, "c-1");
  const forSales = await (await call("GET", "/rfq/sellside?userId=s-1")).json();
  assert(forSales.total >= 1);

  const stats = await (await call("GET", "/rfq/sellside/stats")).json();
  assertEquals(stats.total, 2);
  assertEquals(stats.byState.REJECTED, 1);
  assertEquals(stats.byState.CONFIRMED, 1);
});
