import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import type { RegulatoryRecord } from "../lib/regulatory-records.ts";
import {
  exportKey,
  exportMissingDays,
  serialiseRecords,
  utcDayStart,
} from "./regulatory-export.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 15, 30);

const record = (seq: number, ts: number): RegulatoryRecord => ({
  seq,
  eventId: `orders.child:c${seq}`,
  eventType: "orders.child",
  ts,
  orderId: "o1",
  childId: `c${seq}`,
  payload: {},
  prevHash: "0".repeat(64),
  hash: "1".repeat(64),
});

test("[regulatory-export] keys objects by UTC day", () => {
  assertEquals(exportKey(Date.UTC(2026, 0, 5)), "orders/2026/01/05.ndjson");
  assertEquals(utcDayStart(NOW), Date.UTC(2026, 10, 9));
});

test("[regulatory-export] serialises one JSON record per line", () => {
  const body = serialiseRecords([record(1, NOW), record(2, NOW)]);
  assertEquals(body.split("\n").length, 2);
  assertEquals(JSON.parse(body.split("\n")[1]).seq, 2);
});

test("[regulatory-export] writes only completed days that have records and are not exported", async () => {
  const written: Record<string, string> = {};
  const today = utcDayStart(NOW);
  const keys = await exportMissingDays({
    now: () => NOW,
    store: {
      putObject: async (key, body) => {
        written[key] = body;
      },
      listKeys: async () => [exportKey(today - 3 * DAY)],
    },
    fetchRecords: async (from) => (from === today - DAY ? [record(1, from)] : []),
  });
  assertEquals(keys, [exportKey(today - DAY)]);
  assertEquals(Object.keys(written), [exportKey(today - DAY)]);
});

test("[regulatory-export] never exports the current day", async () => {
  const requested: number[] = [];
  await exportMissingDays({
    now: () => NOW,
    store: { putObject: async () => {}, listKeys: async () => [] },
    fetchRecords: async (from) => {
      requested.push(from);
      return [];
    },
  });
  assertEquals(requested.includes(utcDayStart(NOW)), false);
  assertEquals(requested.length, 3);
});
