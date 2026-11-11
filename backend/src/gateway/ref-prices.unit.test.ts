import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { createRefPriceCache } from "./ref-prices.ts";

const realFetch = globalThis.fetch;
let nowMs = 0;

beforeEach(() => {
  nowMs = 0;
  vi.spyOn(Date, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

test("[ref-prices] returns static fallbacks when cache is empty", () => {
  const cache = createRefPriceCache("http://market-sim:5001", 1_000);
  assertEquals(cache.refPriceFor("AAPL"), 180);
  assertEquals(cache.refPriceFor("UNKNOWN"), 100);
});

test("[ref-prices] refresh stores fetched prices and refPriceFor reads from cache", async () => {
  const fetchMock = vi.fn((_input: Request | URL | string) =>
    Promise.resolve(new Response(JSON.stringify({ AAPL: 181, XYZ: 44 }), { status: 200 }))
  );
  globalThis.fetch = fetchMock as typeof fetch;

  nowMs = 2_000;
  const cache = createRefPriceCache("http://market-sim:5001", 1_000);
  await cache.refresh();

  assertEquals(fetchMock.mock.calls.length, 1);
  assertEquals(String(fetchMock.mock.calls[0][0]), "http://market-sim:5001/prices");
  assertEquals(cache.refPriceFor("AAPL"), 181);
  assertEquals(cache.refPriceFor("XYZ"), 44);
});

test("[ref-prices] refPriceFor triggers background refresh when cache is stale", async () => {
  const fetchMock = vi.fn((_input: Request | URL | string) =>
    Promise.resolve(new Response(JSON.stringify({ TSLA: 251 }), { status: 200 }))
  );
  globalThis.fetch = fetchMock as typeof fetch;

  nowMs = 1_000;
  const cache = createRefPriceCache("http://market-sim:5001", 100);
  await cache.refresh();
  assertEquals(fetchMock.mock.calls.length, 1);

  nowMs = 1_250;
  cache.refPriceFor("TSLA");
  assertEquals(fetchMock.mock.calls.length, 2);
});

test("[ref-prices] failed refresh keeps last known prices", async () => {
  const fetchMock = vi.fn();
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ AAPL: 190 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  fetchMock.mockResolvedValueOnce(new Response("down", { status: 500 }));
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  globalThis.fetch = fetchMock as typeof fetch;

  const cache = createRefPriceCache("http://market-sim:5001", 50);
  await cache.refresh();
  assertEquals(cache.refPriceFor("AAPL"), 190);

  await cache.refresh();
  assertEquals(cache.refPriceFor("AAPL"), 190);

  await cache.refresh();
  assertEquals(cache.refPriceFor("AAPL"), 190);
});
