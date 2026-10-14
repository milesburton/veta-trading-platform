import { assertEquals, assertStrictEquals } from "jsr:@std/assert@0.217";
import { reconstructOrdersFromRows } from "../journal/order-reconstruction.ts";

const T0 = new Date("2026-10-09T13:30:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1_000);

const submitted = [
  "o1",
  "orders.submitted",
  T0,
  "GOOGL",
  "BUY",
  "196",
  "175.72",
  "TWAP",
  "synthetic-trader-equity-high-touch",
  null,
  { clientOrderId: "c1", expiresAt: 60 },
];

Deno.test("[journal-reconstruct] decodes float8 strings from the driver as numbers", () => {
  const [order] = reconstructOrdersFromRows(
    [submitted],
    [["o1", "orders.child", at(1), "BUY", "4", "175.72", null, "k1", null]]
  );
  assertStrictEquals(order.quantity, 196);
  assertStrictEquals(order.limitPrice, 175.72);
  const [child] = order.children as Record<string, unknown>[];
  assertStrictEquals(child.quantity, 4);
  assertStrictEquals(child.limitPrice, 175.72);
});

Deno.test("[journal-reconstruct] applies routing, child and fill events in order", () => {
  const [order] = reconstructOrdersFromRows(
    [submitted, ["o1", "orders.routed", at(1), null, null, null, null, null, null, null, {}]],
    [
      ["o1", "orders.child", at(2), "BUY", "196", "175.72", null, "k1", null],
      ["o1", "orders.filled", at(3), null, null, null, "196", "k1", "175.70"],
    ]
  );
  assertEquals(order.id, "c1");
  assertEquals(order.status, "filled");
  assertStrictEquals(order.filled, 196);
  assertEquals(order.expiresAt, T0.getTime() + 60_000);
  const [child] = order.children as Record<string, unknown>[];
  assertEquals(child.status, "filled");
  assertStrictEquals(child.avgFillPrice, 175.7);
});

Deno.test("[journal-reconstruct] keeps a reject reason and sorts newest first", () => {
  const orders = reconstructOrdersFromRows(
    [
      submitted,
      ["o2", "orders.rejected", at(5), "MSFT", "SELL", "10", "421", null, "u", null, {
        reason: "limit breach",
      }],
    ],
    []
  );
  assertEquals(orders.map((o) => o.id), ["o2", "c1"]);
  assertEquals(orders[0].status, "rejected");
  assertEquals(orders[0].rejectReason, "limit breach");
});
