import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import type { RegulatoryRecord } from "../lib/regulatory-records.ts";
import {
  exportKey,
  exportMissingDays,
  exportedWatermark,
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

test("[regulatory-export] keys segments by UTC day and sequence range", () => {
  assertEquals(
    exportKey(Date.UTC(2026, 0, 5), 1, 42),
    "orders/2026/01/05/000000000001-000000000042.ndjson"
  );
  assertEquals(utcDayStart(NOW), Date.UTC(2026, 10, 9));
});

test("[regulatory-export] watermark is the highest last sequence among a day's segments", () => {
  const day = Date.UTC(2026, 0, 5);
  const keys = [
    exportKey(day, 1, 42),
    exportKey(day, 50, 61),
    exportKey(day + DAY, 62, 900),
    "orders/2026/01/05/unrelated.txt",
  ];
  assertEquals(exportedWatermark(keys, day), 61);
  assertEquals(exportedWatermark(keys, day - DAY), 0);
});

test("[regulatory-export] serialises one JSON record per line", () => {
  const body = serialiseRecords([record(1, NOW), record(2, NOW)]);
  assertEquals(body.split("\n").length, 2);
  assertEquals(JSON.parse(body.split("\n")[1]).seq, 2);
});

test("[regulatory-export] writes only completed days that have unexported records", async () => {
  const written: Record<string, string> = {};
  const today = utcDayStart(NOW);
  const keys = await exportMissingDays({
    now: () => NOW,
    store: {
      putObject: async (key, body) => {
        written[key] = body;
      },
      listKeys: async () => [exportKey(today - 3 * DAY, 1, 5)],
    },
    fetchRecords: async (from) => {
      if (from === today - 3 * DAY) return [record(5, from)];
      if (from === today - DAY) return [record(7, from)];
      return [];
    },
  });
  assertEquals(keys, [exportKey(today - DAY, 7, 7)]);
  assertEquals(Object.keys(written), [exportKey(today - DAY, 7, 7)]);
});

test("[regulatory-export] appends a further segment for records that arrive after a day was exported", async () => {
  const written: Record<string, string> = {};
  const today = utcDayStart(NOW);
  const day = today - 2 * DAY;
  const keys = await exportMissingDays({
    now: () => NOW,
    store: {
      putObject: async (key, body) => {
        written[key] = body;
      },
      listKeys: async () => [exportKey(day, 1, 5)],
    },
    fetchRecords: async (from) =>
      from === day ? [record(3, from), record(5, from), record(9, from), record(12, from)] : [],
  });
  assertEquals(keys, [exportKey(day, 9, 12)]);
  assertEquals(
    written[exportKey(day, 9, 12)].split("\n").map((line) => JSON.parse(line).seq),
    [9, 12]
  );
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
