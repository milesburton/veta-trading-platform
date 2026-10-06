import { assertEquals } from "jsr:@std/assert@0.217";
import {
  classifyOrder,
  createProgressReader,
  expiredEvent,
  type OrderProgress,
  readSliceBudget,
  remainingQty,
  settleInFlight,
  type TrackedOrder,
} from "../algo/fill-progress.ts";
import { decodeOrderId, summariseFills } from "../journal/order-progress.ts";

const progress = (overrides: Partial<OrderProgress> = {}): OrderProgress => ({
  orderId: "ord-1",
  filledQty: 0,
  avgFillPrice: 0,
  filledChildIds: [],
  ...overrides,
});

const order: TrackedOrder = {
  orderId: "ord-1",
  clientOrderId: "cli-1",
  asset: "AAPL",
  side: "BUY",
  quantity: 1_000,
  expiresAt: 10_000,
};

Deno.test("summariseFills sums quantity and volume-weights the price", () => {
  const summary = summariseFills("ord-1", [
    ["c1", 100, 10],
    ["c2", "300", "20"],
  ]);
  assertEquals(summary.filledQty, 400);
  assertEquals(summary.avgFillPrice, 17.5);
  assertEquals(summary.filledChildIds, ["c1", "c2"]);
});

Deno.test("summariseFills returns zero progress when there are no fills", () => {
  assertEquals(summariseFills("ord-1", []), progress());
});

Deno.test("summariseFills ignores null child ids and non-numeric values", () => {
  const summary = summariseFills("ord-1", [[null, null, null], ["c1", 50, 2]]);
  assertEquals(summary.filledQty, 50);
  assertEquals(summary.filledChildIds, ["c1"]);
});

Deno.test("decodeOrderId returns null on malformed percent-encoding", () => {
  assertEquals(decodeOrderId("ord%2F1"), "ord/1");
  assertEquals(decodeOrderId("ord%E0%A4%A"), null);
});

Deno.test("settleInFlight clears a child once the journal shows its fill", () => {
  const inFlight = { childId: "c1", quantity: 100, sentAt: 1_000 };
  assertEquals(settleInFlight(inFlight, progress({ filledChildIds: ["c1"] }), 1_100, 3_000), null);
});

Deno.test("settleInFlight keeps an unconfirmed child until the settle window passes", () => {
  const inFlight = { childId: "c1", quantity: 100, sentAt: 1_000 };
  assertEquals(settleInFlight(inFlight, progress(), 2_000, 3_000), inFlight);
  assertEquals(settleInFlight(inFlight, progress(), 4_000, 3_000), null);
});

Deno.test("remainingQty subtracts journal fills and in-flight quantity", () => {
  const inFlight = { childId: "c2", quantity: 200, sentAt: 0 };
  assertEquals(remainingQty(1_000, progress({ filledQty: 300 }), inFlight), 500);
  assertEquals(remainingQty(1_000, progress({ filledQty: 1_200 }), null), 0);
});

Deno.test("readSliceBudget returns null when the journal is unavailable", async () => {
  const budget = await readSliceBudget(() => Promise.resolve(null), "ord-1", 1_000, null, 0);
  assertEquals(budget, null);
});

Deno.test("readSliceBudget does not count unfilled IOC remainder as filled", async () => {
  const inFlight = { childId: "c1", quantity: 500, sentAt: 0 };
  const budget = await readSliceBudget(
    () => Promise.resolve(progress({ filledQty: 120, filledChildIds: ["c1"] })),
    "ord-1",
    1_000,
    inFlight,
    100
  );
  assertEquals(budget?.inFlight, null);
  assertEquals(budget?.remaining, 880);
});

Deno.test("classifyOrder prefers complete over expired", () => {
  assertEquals(classifyOrder(order, progress({ filledQty: 1_000 }), 20_000), "complete");
  assertEquals(classifyOrder(order, progress({ filledQty: 999 }), 20_000), "expired");
  assertEquals(classifyOrder(order, null, 5_000), "working");
});

Deno.test("expiredEvent reports journal fills, or zero when unknown", () => {
  const event = expiredEvent(order, "TWAP", progress({ filledQty: 400, avgFillPrice: 12.5 }), 7);
  assertEquals(event.filledQty, 400);
  assertEquals(event.avgFillPrice, 12.5);
  assertEquals(expiredEvent(order, "TWAP", null, 7).filledQty, 0);
});

Deno.test("createProgressReader validates the journal response", async () => {
  const respond = (body: unknown, status = 200) => () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const valid = progress({ filledQty: 10, avgFillPrice: 1, filledChildIds: ["c1"] });
  assertEquals(await createProgressReader("http://j", respond(valid))("ord-1"), valid);
  assertEquals(await createProgressReader("http://j", respond({ filledQty: "x" }))("ord-1"), null);
  assertEquals(await createProgressReader("http://j", respond({}, 500))("ord-1"), null);
  const failing = () => Promise.reject(new Error("down"));
  assertEquals(await createProgressReader("http://j", failing)("ord-1"), null);
});

Deno.test("createProgressReader encodes the order id in the path", async () => {
  const seen: string[] = [];
  const capture = (input: string | URL | Request) => {
    seen.push(String(input));
    return Promise.resolve(new Response(JSON.stringify(progress()), { status: 200 }));
  };
  await createProgressReader("http://j", capture as typeof fetch)("a/b");
  assertEquals(seen, ["http://j/journal/order/a%2Fb/progress"]);
});
