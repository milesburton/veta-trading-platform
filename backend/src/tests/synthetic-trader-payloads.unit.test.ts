import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

import {
  interpretOrderEvent,
  OrderEventDataSchema,
  PricesSchema,
} from "../synthetic-trader/payloads.ts";

test("[synthetic-trader-payloads] prices schema accepts a symbol to price map", () => {
  const result = PricesSchema.safeParse({ AAPL: 192.5, MSFT: 410.1 });
  assert(result.success);
  assertEquals(result.data, { AAPL: 192.5, MSFT: 410.1 });
});

test("[synthetic-trader-payloads] prices schema accepts an empty map", () => {
  assert(PricesSchema.safeParse({}).success);
});

test("[synthetic-trader-payloads] prices schema rejects non-numeric prices", () => {
  assertEquals(PricesSchema.safeParse({ AAPL: "192.5" }).success, false);
  assertEquals(PricesSchema.safeParse({ AAPL: null }).success, false);
  assertEquals(PricesSchema.safeParse({ AAPL: { last: 1 } }).success, false);
});

test("[synthetic-trader-payloads] prices schema rejects non-object payloads", () => {
  assertEquals(PricesSchema.safeParse([192.5]).success, false);
  assertEquals(PricesSchema.safeParse("oops").success, false);
  assertEquals(PricesSchema.safeParse(null).success, false);
});

test("[synthetic-trader-payloads] order event schema allows missing optional fields", () => {
  assert(OrderEventDataSchema.safeParse({}).success);
  assert(OrderEventDataSchema.safeParse({ clientOrderId: null }).success);
});

test("[synthetic-trader-payloads] a fill with no remaining quantity is terminal", () => {
  assertEquals(interpretOrderEvent("orders.filled", { clientOrderId: "c1" }), {
    kind: "filled",
    clientOrderId: "c1",
    terminal: true,
  });
});

test("[synthetic-trader-payloads] a fill with zero remaining quantity is terminal", () => {
  assertEquals(interpretOrderEvent("orders.filled", { clientOrderId: "c1", remainingQty: 0 }), {
    kind: "filled",
    clientOrderId: "c1",
    terminal: true,
  });
});

test("[synthetic-trader-payloads] a partial fill is not terminal", () => {
  assertEquals(interpretOrderEvent("orders.filled", { clientOrderId: "c1", remainingQty: 40 }), {
    kind: "filled",
    clientOrderId: "c1",
    terminal: false,
  });
});

test("[synthetic-trader-payloads] cancelled and expired events terminate the order", () => {
  for (const topic of ["orders.cancelled", "orders.expired"]) {
    assertEquals(interpretOrderEvent(topic, { clientOrderId: "c2" }), {
      kind: "terminated",
      clientOrderId: "c2",
    });
  }
});

test("[synthetic-trader-payloads] unrelated topics are ignored even with malformed data", () => {
  assertEquals(interpretOrderEvent("orders.routed", { clientOrderId: 7 }), { kind: "ignored" });
  assertEquals(interpretOrderEvent("", {}), { kind: "ignored" });
});

test("[synthetic-trader-payloads] a non-string clientOrderId is malformed", () => {
  const result = interpretOrderEvent("orders.cancelled", { clientOrderId: 42 });
  assertEquals(result.kind, "malformed");
});

test("[synthetic-trader-payloads] a non-numeric remainingQty is malformed, not terminal", () => {
  const result = interpretOrderEvent("orders.filled", {
    clientOrderId: "c1",
    remainingQty: "0",
  });
  assertEquals(result.kind, "malformed");
});

test("[synthetic-trader-payloads] non-object event data is malformed", () => {
  assertEquals(interpretOrderEvent("orders.filled", null).kind, "malformed");
  assertEquals(interpretOrderEvent("orders.expired", "x").kind, "malformed");
});
