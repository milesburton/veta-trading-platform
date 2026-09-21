import { assertEquals } from "jsr:@std/assert@0.217";
import {
  bookFromSnapshot,
  matchAgainstSnapshot,
} from "../ems/matching-engine.ts";
import type { OrderBookSnapshot } from "../lib/market-sim-client.ts";

function snapshot(
  overrides: Partial<OrderBookSnapshot> = {},
): OrderBookSnapshot {
  return {
    bids: [
      { price: 99.9, size: 100 },
      { price: 99.8, size: 200 },
    ],
    asks: [
      { price: 100.1, size: 100 },
      { price: 100.2, size: 200 },
    ],
    mid: 100,
    ts: 0,
    ...overrides,
  };
}

Deno.test("[matching-engine] bookFromSnapshot seeds bids and asks from the venue snapshot", () => {
  const book = bookFromSnapshot("AAPL", snapshot(), 0);
  assertEquals(book.bids.length, 2);
  assertEquals(book.asks.length, 2);
  assertEquals(book.bids[0].price, 99.9);
  assertEquals(book.asks[0].price, 100.1);
});

Deno.test("[matching-engine] bookFromSnapshot skips zero-size levels", () => {
  const book = bookFromSnapshot(
    "AAPL",
    snapshot({ bids: [{ price: 99.9, size: 0 }], asks: [] }),
    0,
  );
  assertEquals(book.bids.length, 0);
  assertEquals(book.asks.length, 0);
});

Deno.test("[matching-engine] a marketable buy fills against the best ask first", () => {
  const result = matchAgainstSnapshot(
    "C1",
    "AAPL",
    "BUY",
    50,
    101,
    snapshot(),
    0,
  );
  assertEquals(result.filledQty, 50);
  assertEquals(result.remainingQty, 0);
  assertEquals(result.avgFillPrice, 100.1);
  assertEquals(result.fills.length, 1);
});

Deno.test("[matching-engine] a buy walks multiple ask levels and averages the fill price", () => {
  const result = matchAgainstSnapshot(
    "C2",
    "AAPL",
    "BUY",
    150,
    101,
    snapshot(),
    0,
  );
  assertEquals(result.filledQty, 150);
  assertEquals(result.remainingQty, 0);
  const expectedAvg = (100.1 * 100 + 100.2 * 50) / 150;
  assertEquals(result.avgFillPrice, parseFloat(expectedAvg.toFixed(4)));
  assertEquals(result.fills.length, 2);
});

Deno.test("[matching-engine] demand exceeding total depth leaves a remainder unfilled", () => {
  const result = matchAgainstSnapshot(
    "C3",
    "AAPL",
    "BUY",
    1_000,
    101,
    snapshot(),
    0,
  );
  assertEquals(result.filledQty, 300);
  assertEquals(result.remainingQty, 700);
});

Deno.test("[matching-engine] a non-crossing limit price yields no fill", () => {
  const result = matchAgainstSnapshot(
    "C4",
    "AAPL",
    "BUY",
    50,
    99,
    snapshot(),
    0,
  );
  assertEquals(result.filledQty, 0);
  assertEquals(result.remainingQty, 50);
  assertEquals(result.avgFillPrice, undefined);
});

Deno.test("[matching-engine] a sell fills against the best bid first", () => {
  const result = matchAgainstSnapshot(
    "C5",
    "AAPL",
    "SELL",
    50,
    99,
    snapshot(),
    0,
  );
  assertEquals(result.filledQty, 50);
  assertEquals(result.avgFillPrice, 99.9);
});
