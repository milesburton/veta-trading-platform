import { vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import type { Pool } from "./db.ts";
import {
  appendRegulatoryEvent,
  firstBrokenRegulatorySeq,
  isRegulatoryTopic,
  regulatoryEventsBetween,
  regulatoryHead,
  regulatorySubmissions,
} from "./regulatory-records.ts";

function fakePool() {
  const queryArray = vi.fn().mockResolvedValue({ rows: [] });
  const queryObject = vi.fn().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({
    queryArray,
    queryObject,
    release,
  } as {
    queryArray: typeof queryArray;
    queryObject: typeof queryObject;
    release: typeof release;
  });
  return {
    pool: { connect } as unknown as Pool,
    connect,
    queryArray,
    queryObject,
    release,
  };
}

test("[regulatory-records] topic guard accepts known topics and rejects unknown ones", () => {
  assertEquals(isRegulatoryTopic("orders.routed"), true);
  assertEquals(isRegulatoryTopic("orders.unknown"), false);
});

test("[regulatory-records] append writes event payload and always releases the client", async () => {
  const { pool, queryArray, release } = fakePool();
  await appendRegulatoryEvent(pool, {
    eventId: "e1",
    eventType: "orders.submitted",
    ts: 1_700_000_001_000,
    orderId: "o1",
    childId: null,
    payload: { qty: 10 },
  });

  assertEquals(queryArray.mock.calls.length, 1);
  assertEquals(queryArray.mock.calls[0][1], [
    "e1",
    "orders.submitted",
    1_700_000_001_000,
    "o1",
    null,
    '{"qty":10}',
  ]);
  assertEquals(release.mock.calls.length, 1);
});

test("[regulatory-records] firstBrokenRegulatorySeq maps bigint and null rows", async () => {
  const { pool, queryObject, release } = fakePool();
  queryObject.mockResolvedValueOnce({ rows: [{ broken: 7n }] });
  queryObject.mockResolvedValueOnce({ rows: [{ broken: null }] });
  queryObject.mockResolvedValueOnce({ rows: [] });

  assertEquals(await firstBrokenRegulatorySeq(pool), 7);
  assertEquals(await firstBrokenRegulatorySeq(pool), null);
  assertEquals(await firstBrokenRegulatorySeq(pool), null);
  assertEquals(release.mock.calls.length, 3);
});

test("[regulatory-records] regulatoryHead returns the newest hash or null", async () => {
  const { pool, queryObject, release } = fakePool();
  queryObject.mockResolvedValueOnce({ rows: [{ seq: 9n, hash: "h9" }] });
  queryObject.mockResolvedValueOnce({ rows: [] });

  assertEquals(await regulatoryHead(pool), { seq: 9, hash: "h9" });
  assertEquals(await regulatoryHead(pool), null);
  assertEquals(release.mock.calls.length, 2);
});

test("[regulatory-records] regulatoryEventsBetween maps row fields into domain records", async () => {
  const { pool, queryObject, release } = fakePool();
  queryObject.mockResolvedValueOnce({
    rows: [
      {
        seq: 2n,
        event_id: "e2",
        event_type: "orders.child",
        ts: new Date(1_700_000_000_000),
        order_id: "o1",
        child_id: "c1",
        payload: { qty: 20 },
        prev_hash: "h1",
        hash: "h2",
      },
    ],
  });

  const events = await regulatoryEventsBetween(pool, 1000, 2000);
  assertEquals(events, [
    {
      seq: 2,
      eventId: "e2",
      eventType: "orders.child",
      ts: 1_700_000_000_000,
      orderId: "o1",
      childId: "c1",
      payload: { qty: 20 },
      prevHash: "h1",
      hash: "h2",
    },
  ]);
  assertEquals(queryObject.mock.calls[0][1], [1000, 2000]);
  assertEquals(release.mock.calls.length, 1);
});

test("[regulatory-records] regulatorySubmissions fast-paths empty ids and maps results", async () => {
  const { pool, connect, queryObject, release } = fakePool();

  const empty = await regulatorySubmissions(pool, []);
  assertEquals(Array.from(empty.entries()), []);
  assertEquals(connect.mock.calls.length, 0);

  queryObject.mockResolvedValueOnce({
    rows: [
      { order_id: "o1", payload: { venue: "XNAS" } },
      { order_id: "o2", payload: { venue: "XNYS" } },
    ],
  });
  const mapped = await regulatorySubmissions(pool, ["o1", "o2"]);
  assertEquals(Array.from(mapped.entries()), [
    ["o1", { venue: "XNAS" }],
    ["o2", { venue: "XNYS" }],
  ]);
  assertEquals(queryObject.mock.calls[0][1], [["o1", "o2"]]);
  assertEquals(release.mock.calls.length, 1);
});
