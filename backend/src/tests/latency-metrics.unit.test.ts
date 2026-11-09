import { vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";

const h = vi.hoisted(() => ({
  rows: [] as unknown[][],
  released: 0,
  params: [] as unknown[][],
}));

vi.mock("#veta/db", () => ({
  journalPool: {
    connect: () =>
      Promise.resolve({
        queryArray: (_sql: string, params: unknown[]) => {
          h.params.push(params);
          return Promise.resolve({ rows: h.rows });
        },
        release: () => {
          h.released++;
        },
      }),
  },
}));

import { computeLatencyMetrics } from "../journal/latency-metrics.ts";

const at = (ms: number) => new Date(1_000_000 + ms);

test("[latency-metrics] an empty window yields zeroed stages", async () => {
  h.rows = [];
  const m = await computeLatencyMetrics(60_000);
  assertEquals(m.sampleSize, 0);
  assertEquals(m.stages.submittedToFilled, { count: 0, p50: 0, p95: 0, p99: 0, max: 0 });
  assertEquals(h.released > 0, true);
});

test("[latency-metrics] derives every stage from the earliest event per order and child", async () => {
  h.rows = [
    ["o1", null, "orders.submitted", at(100), at(140)],
    ["o1", null, "orders.submitted", at(50), at(60)],
    ["o1", null, "orders.routed", at(200), null],
    ["o1", null, "orders.routed", at(180), null],
    ["o1", "c1", "orders.child", at(300), null],
    ["o1", "c1", "orders.child", at(250), null],
    ["o1", "c2", "orders.child", String(1_000_400), null],
    ["o1", "c1", "orders.filled", at(500), null],
    ["o1", "c1", "orders.filled", at(450), null],
    ["o1", "c2", "orders.filled", at(900), null],
    ["o2", null, "orders.routed", at(10), null],
    ["o3", null, "orders.submitted", at(0), null],
    ["o3", null, "orders.routed", at(-5), null],
    ["o3", "c9", "orders.child", at(-10), null],
    ["o3", "c9", "orders.filled", at(-20), null],
    ["o4", null, "orders.filled", at(1), null],
  ];
  const m = await computeLatencyMetrics(60_000);
  assertEquals(m.sampleSize, 2);
  assertEquals(m.stages.submittedToArrived.count, 1);
  assertEquals(m.stages.submittedToArrived.max, 90);
  assertEquals(m.stages.submittedToRouted.count, 2);
  assertEquals(m.stages.submittedToRouted.max, 130);
  assertEquals(m.stages.routedToChild.count, 2);
  assertEquals(m.stages.childToFilled.count, 3);
  assertEquals(m.stages.childToFilled.max, 500);
  assertEquals(m.stages.submittedToFilled.max, 850);
  assertEquals(m.stages.submittedToFilled.p50, 0);
});

test("[latency-metrics] percentiles pick ranked samples", async () => {
  h.rows = Array.from({ length: 100 }, (_, i) => [
    `o${i}`,
    null,
    "orders.submitted",
    at(0),
    at(i + 1),
  ]);
  const m = await computeLatencyMetrics(1_000);
  const s = m.stages.submittedToArrived;
  assertEquals([s.count, s.p50, s.p95, s.p99, s.max], [100, 50, 95, 99, 100]);
});
