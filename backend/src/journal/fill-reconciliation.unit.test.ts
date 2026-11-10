import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { type ArchivedExecution, fillEventId, missingFillPayloads } from "./fill-reconciliation.ts";

const execution = (overrides: Partial<ArchivedExecution>): ArchivedExecution => ({
  execId: "E1",
  clOrdId: "C1",
  origClOrdId: "P1",
  symbol: "AAPL",
  side: "1",
  cumQty: 5,
  avgPx: 100,
  lastQty: 5,
  lastPx: 100,
  leavesQty: 5,
  commission: 0.5,
  ts: 1000,
  ...overrides,
});

test("fillEventId keys on child and execution", () => {
  assertEquals(fillEventId("C1", "E1"), "orders.filled:C1:E1");
});

test("multiple executions for one child use per-execution quantities", () => {
  const payloads = missingFillPayloads(
    [
      execution({ execId: "E1", cumQty: 5, lastQty: 5, lastPx: 100 }),
      execution({ execId: "E2", cumQty: 10, lastQty: 5, lastPx: 102, leavesQty: 0 }),
    ],
    new Set()
  );
  assertEquals(
    payloads.map((p) => [p.execId, p.filledQty, p.avgFillPrice]),
    [
      ["E1", 5, 100],
      ["E2", 5, 102],
    ]
  );
});

test("recovers only the missing execution of a partially journalled child", () => {
  const payloads = missingFillPayloads(
    [
      execution({ execId: "E1", lastQty: 5 }),
      execution({ execId: "E2", cumQty: 10, lastQty: 5, leavesQty: 0 }),
    ],
    new Set([fillEventId("C1", "E1")])
  );
  assertEquals(payloads.length, 1);
  assertEquals(payloads[0].execId, "E2");
  assertEquals(payloads[0].remainingQty, 0);
});

test("maps FIX side codes and flags reconciled payloads", () => {
  const [sell] = missingFillPayloads([execution({ side: "2" })], new Set());
  assertEquals(sell.side, "SELL");
  assertEquals(sell._reconciled, true);
});
