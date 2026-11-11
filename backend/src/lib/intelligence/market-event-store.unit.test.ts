import { vi } from "vitest";
import type { Pool } from "#veta/db";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import type { MarketAdapterEvent } from "#veta/types/intelligence";
import { createMarketEventStore } from "./market-event-store.ts";

function fakePool() {
  const queryArray = vi.fn().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ queryArray, release });
  return {
    pool: { connect } as unknown as Pool,
    connect,
    queryArray,
    release,
  };
}

test("[market-event-store] upsert writes all event fields and releases the client", async () => {
  const { pool, queryArray, release } = fakePool();
  const store = createMarketEventStore(pool);
  const event: MarketAdapterEvent = {
    id: "evt-1",
    type: "earnings",
    ticker: undefined,
    headline: "AAPL reports earnings",
    scheduledAt: 1_700_000_010_000,
    impact: "high",
    ts: 1_700_000_000_000,
  };

  await store.upsertEvent(event, "calendar");

  assertEquals(queryArray.mock.calls.length, 1);
  assertEquals(queryArray.mock.calls[0][1], [
    "evt-1",
    "earnings",
    null,
    "AAPL reports earnings",
    1_700_000_010_000,
    "high",
    "calendar",
    1_700_000_000_000,
  ]);
  assertEquals(release.mock.calls.length, 1);
});

test("[market-event-store] getEvents without ticker uses range filter and maps rows", async () => {
  const { pool, queryArray, release } = fakePool();
  queryArray.mockResolvedValueOnce({
    rows: [
      [
        "evt-2",
        "dividend",
        null,
        "Macro dividend calendar",
        1_700_000_020_000,
        "medium",
        "calendar",
        1_700_000_000_100,
      ],
    ],
  });
  const store = createMarketEventStore(pool);

  const events = await store.getEvents(1000, 2000);

  assertEquals(events, [
    {
      id: "evt-2",
      type: "dividend",
      ticker: undefined,
      headline: "Macro dividend calendar",
      scheduledAt: 1_700_000_020_000,
      impact: "medium",
      ts: 1_700_000_000_100,
    },
  ]);
  assertEquals(queryArray.mock.calls[0][1], [1000, 2000]);
  assertEquals(release.mock.calls.length, 1);
});

test("[market-event-store] getEvents with ticker includes symbol filter params", async () => {
  const { pool, queryArray, release } = fakePool();
  queryArray.mockResolvedValueOnce({
    rows: [
      [
        "evt-3",
        "split",
        "TSLA",
        "TSLA split event",
        1_700_000_030_000,
        "low",
        "calendar",
        1_700_000_000_200,
      ],
    ],
  });
  const store = createMarketEventStore(pool);

  const events = await store.getEvents(3000, 4000, "TSLA");

  assertEquals(events, [
    {
      id: "evt-3",
      type: "split",
      ticker: "TSLA",
      headline: "TSLA split event",
      scheduledAt: 1_700_000_030_000,
      impact: "low",
      ts: 1_700_000_000_200,
    },
  ]);
  assertEquals(queryArray.mock.calls[0][1], [3000, 4000, "TSLA"]);
  assertEquals(release.mock.calls.length, 1);
});
