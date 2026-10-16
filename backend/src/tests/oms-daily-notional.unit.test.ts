import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import {
  createDailyNotionalLedger,
  createMarketPriceSource,
  orderReferencePrice,
  tradingDayKey,
} from "../oms/daily-notional.ts";

test("cumulative breach across several individually passing orders", () => {
  const ledger = createDailyNotionalLedger();
  const day = "2026-10-15";
  assertEquals(ledger.reserve("u1", day, 400_000, 1_000_000), { allowed: true, total: 400_000 });
  assertEquals(ledger.reserve("u1", day, 400_000, 1_000_000), { allowed: true, total: 800_000 });
  assertEquals(ledger.reserve("u1", day, 400_000, 1_000_000), {
    allowed: false,
    used: 800_000,
    attempted: 400_000,
  });
});

test("rejected order does not consume the limit", () => {
  const ledger = createDailyNotionalLedger();
  const day = "2026-10-15";
  ledger.reserve("u1", day, 900_000, 1_000_000);
  assertEquals(ledger.reserve("u1", day, 200_000, 1_000_000).allowed, false);
  assertEquals(ledger.reserve("u1", day, 100_000, 1_000_000), { allowed: true, total: 1_000_000 });
});

test("totals are tracked per user", () => {
  const ledger = createDailyNotionalLedger();
  ledger.reserve("u1", "2026-10-15", 900_000, 1_000_000);
  assertEquals(ledger.reserve("u2", "2026-10-15", 900_000, 1_000_000).allowed, true);
});

test("new trading day resets the total", () => {
  const ledger = createDailyNotionalLedger();
  ledger.reserve("u1", "2026-10-15", 900_000, 1_000_000);
  assertEquals(ledger.reserve("u1", "2026-10-15", 200_000, 1_000_000).allowed, false);
  assertEquals(ledger.reserve("u1", "2026-10-16", 200_000, 1_000_000), {
    allowed: true,
    total: 200_000,
  });
});

test("tradingDayKey rolls over at New York midnight", () => {
  const beforeMidnight = Date.UTC(2026, 9, 16, 3, 59, 0);
  const afterMidnight = Date.UTC(2026, 9, 16, 4, 1, 0);
  assertEquals(tradingDayKey(beforeMidnight), "2026-10-15");
  assertEquals(tradingDayKey(afterMidnight), "2026-10-16");
});

test("market order uses reference price so it counts toward the limit", () => {
  const ledger = createDailyNotionalLedger();
  const price = orderReferencePrice(undefined, 250) ?? 0;
  assertEquals(price, 250);
  assertEquals(ledger.reserve("u1", "2026-10-15", 3_000 * price, 1_000_000).allowed, true);
  assertEquals(ledger.reserve("u1", "2026-10-15", 2_000 * price, 1_000_000).allowed, false);
});

test("limit price takes precedence and missing price fails closed", () => {
  assertEquals(orderReferencePrice(100, 250), 100);
  assertEquals(orderReferencePrice(undefined, undefined), null);
  assertEquals(orderReferencePrice(undefined, 0), null);
  assertEquals(orderReferencePrice(0, NaN), null);
});

test("price source caches snapshot and returns undefined on failure", async () => {
  let calls = 0;
  let clock = 0;
  const okFetch = (() => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ AAPL: 180 })));
  }) as typeof fetch;
  const source = createMarketPriceSource("http://x", 1_000, okFetch, () => clock);
  assertEquals(await source.priceFor("AAPL"), 180);
  assertEquals(await source.priceFor("AAPL"), 180);
  assertEquals(await source.priceFor("MISSING"), undefined);
  assertEquals(calls, 1);
  clock = 2_000;
  await source.priceFor("AAPL");
  assertEquals(calls, 2);

  const failing = createMarketPriceSource("http://x", 1_000, (() =>
    Promise.reject(new Error("down"))) as typeof fetch);
  assertEquals(await failing.priceFor("AAPL"), undefined);
  const malformed = createMarketPriceSource("http://x", 1_000, (() =>
    Promise.resolve(new Response(JSON.stringify({ AAPL: "x" })))) as typeof fetch);
  assertEquals(await malformed.priceFor("AAPL"), undefined);
});
