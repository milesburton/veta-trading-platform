import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  BOOK_MATERIAL_BPS,
  buildTickDiff,
  createTickDiffState,
  FULL_SNAPSHOT_INTERVAL_MS,
  isEmptyDiff,
  type TickPayload,
} from "../market-sim/tickDiff.ts";

function makeBook(mid: number) {
  return {
    bids: [{ price: mid - 0.01, size: 100 }],
    asks: [{ price: mid + 0.01, size: 100 }],
    mid,
    ts: 0,
  };
}

function makePayload(prices: Record<string, number>): TickPayload {
  const orderBook: TickPayload["orderBook"] = {};
  const volumes: Record<string, number> = {};
  for (const [sym, price] of Object.entries(prices)) {
    orderBook[sym] = makeBook(price);
    volumes[sym] = 1_000;
  }
  return {
    prices,
    openPrices: { ...prices },
    volumes,
    marketMinute: 100,
    orderBook,
    sessionPhase: "CONTINUOUS",
  };
}

Deno.test("first publish emits a full snapshot", () => {
  const state = createTickDiffState();
  const payload = makePayload({ AAPL: 190, MSFT: 400 });

  const { diff, nextState } = buildTickDiff(payload, state, 1_000);

  assert(diff.full === true);
  assertEquals(diff.prices, { AAPL: 190, MSFT: 400 });
  assertEquals(diff.openPrices, { AAPL: 190, MSFT: 400 });
  assertEquals(diff.marketMinute, 100);
  assertEquals(diff.sessionPhase, "CONTINUOUS");
  assertEquals(nextState.lastFullSnapshotAt, 1_000);
});

Deno.test("identical follow-up tick produces an empty diff", () => {
  const state = createTickDiffState();
  const payload = makePayload({ AAPL: 190, MSFT: 400 });

  const { nextState: afterFull } = buildTickDiff(payload, state, 1_000);
  const { diff } = buildTickDiff(payload, afterFull, 1_250);

  assert(!diff.full);
  assert(isEmptyDiff(diff));
});

Deno.test("only moved symbols appear in subsequent diff", () => {
  const state = createTickDiffState();
  const initial = makePayload({ AAPL: 190, MSFT: 400, GOOG: 170 });
  const { nextState: afterFull } = buildTickDiff(initial, state, 1_000);

  const moved = makePayload({ AAPL: 191, MSFT: 400, GOOG: 170 });
  moved.volumes = { AAPL: 2_000, MSFT: 1_000, GOOG: 1_000 };
  const { diff } = buildTickDiff(moved, afterFull, 1_250);

  assertEquals(diff.prices, { AAPL: 191 });
  assertEquals(diff.volumes, { AAPL: 2_000 });
  assert(diff.orderBook?.AAPL !== undefined);
  assert(diff.orderBook?.MSFT === undefined);
  assert(diff.orderBook?.GOOG === undefined);
});

Deno.test("sub-epsilon noise does not trigger a diff entry", () => {
  const state = createTickDiffState();
  const initial = makePayload({ AAPL: 190.0 });
  const { nextState } = buildTickDiff(initial, state, 1_000);

  const jitter = makePayload({ AAPL: 190.00001 });
  const { diff } = buildTickDiff(jitter, nextState, 1_250);

  assert(diff.prices === undefined);
  assert(isEmptyDiff(diff));
});

Deno.test("marketMinute change is emitted on its own", () => {
  const state = createTickDiffState();
  const initial = makePayload({ AAPL: 190 });
  const { nextState } = buildTickDiff(initial, state, 1_000);

  const next = makePayload({ AAPL: 190 });
  next.marketMinute = 101;
  const { diff } = buildTickDiff(next, nextState, 1_250);

  assertEquals(diff.marketMinute, 101);
  assert(diff.prices === undefined);
});

Deno.test("sessionPhase change is emitted on its own", () => {
  const state = createTickDiffState();
  const { nextState } = buildTickDiff(
    makePayload({ AAPL: 190 }),
    state,
    1_000,
  );

  const next = makePayload({ AAPL: 190 });
  next.sessionPhase = "CLOSING_AUCTION";
  const { diff } = buildTickDiff(next, nextState, 1_250);

  assertEquals(diff.sessionPhase, "CLOSING_AUCTION");
  assert(diff.prices === undefined);
});

Deno.test("periodic full snapshot fires after the interval elapses", () => {
  const state = createTickDiffState();
  const payload = makePayload({ AAPL: 190 });

  const { nextState: afterFull } = buildTickDiff(payload, state, 1_000);
  const dueAt = 1_000 + FULL_SNAPSHOT_INTERVAL_MS;
  const { diff } = buildTickDiff(payload, afterFull, dueAt);

  assert(diff.full === true);
  assertEquals(diff.prices, { AAPL: 190 });
});

Deno.test("a newly-introduced symbol always appears in the diff", () => {
  const state = createTickDiffState();
  const { nextState } = buildTickDiff(
    makePayload({ AAPL: 190 }),
    state,
    1_000,
  );

  const withNew = makePayload({ AAPL: 190, NEWCO: 50 });
  const { diff } = buildTickDiff(withNew, nextState, 1_250);

  assertEquals(diff.prices, { NEWCO: 50 });
  assert(diff.orderBook?.NEWCO !== undefined);
});

const SYMBOL_COUNT = 287;
const TICKS_PER_SECOND = 4;
const SECONDS = 60;
const ALERT_THRESHOLD_BYTES_PER_SEC = 512 * 1024;
const PER_TICK_STDEV_BPS = 5;

function makeUniverse(count: number): Record<string, number> {
  const prices: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    prices[`SYM${i.toString().padStart(4, "0")}`] = 100 + (i % 50);
  }
  return prices;
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function jitterPrices(
  prices: Record<string, number>,
  rng: () => number,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [sym, price] of Object.entries(prices)) {
    const stepBps = gaussian(rng) * PER_TICK_STDEV_BPS;
    next[sym] = parseFloat((price * (1 + stepBps / 10_000)).toFixed(4));
  }
  return next;
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

Deno.test("realistic 287-symbol stream stays well under the alert bandwidth budget", () => {
  const rng = seededRng(1);
  let prices = makeUniverse(SYMBOL_COUNT);
  let state = createTickDiffState();
  let totalBytes = 0;
  let totalMessages = 0;

  for (let s = 0; s < SECONDS; s++) {
    for (let t = 0; t < TICKS_PER_SECOND; t++) {
      const now = s * 1000 + t * 250;
      prices = jitterPrices(prices, rng);
      const payload = makePayload(prices);
      const { diff, nextState } = buildTickDiff(payload, state, now);
      state = nextState;
      if (!isEmptyDiff(diff)) {
        totalBytes += JSON.stringify(diff).length;
        totalMessages++;
      }
    }
  }

  const bytesPerSec = totalBytes / SECONDS;
  const headroomRatio = bytesPerSec / ALERT_THRESHOLD_BYTES_PER_SEC;
  assert(
    headroomRatio < 0.5,
    `bandwidth ${(bytesPerSec / 1024).toFixed(1)} KiB/s exceeds 50% of alert threshold (512 KiB/s); ratio=${headroomRatio.toFixed(2)} msgs=${totalMessages}`,
  );
});

interface ConsumerState {
  prices: Record<string, number>;
  openPrices: Record<string, number>;
  volumes: Record<string, number>;
  orderBook: Record<string, { mid: number }>;
  marketMinute: number | null;
  sessionPhase: string | null;
}

function newConsumer(): ConsumerState {
  return {
    prices: {},
    openPrices: {},
    volumes: {},
    orderBook: {},
    marketMinute: null,
    sessionPhase: null,
  };
}

function applyDiff(
  consumer: ConsumerState,
  diff: ReturnType<typeof buildTickDiff>["diff"],
): void {
  if (diff.full) {
    consumer.prices = {};
    consumer.openPrices = {};
    consumer.volumes = {};
    consumer.orderBook = {};
  }
  if (diff.prices) {
    for (const [sym, v] of Object.entries(diff.prices)) consumer.prices[sym] = v;
  }
  if (diff.openPrices) {
    for (const [sym, v] of Object.entries(diff.openPrices)) {
      consumer.openPrices[sym] = v;
    }
  }
  if (diff.volumes) {
    for (const [sym, v] of Object.entries(diff.volumes)) consumer.volumes[sym] = v;
  }
  if (diff.orderBook) {
    for (const [sym, v] of Object.entries(diff.orderBook)) {
      consumer.orderBook[sym] = { mid: v.mid };
    }
  }
  if (diff.marketMinute !== undefined) consumer.marketMinute = diff.marketMinute;
  if (diff.sessionPhase !== undefined) consumer.sessionPhase = diff.sessionPhase;
}

Deno.test("consumer state after applying diffs matches full-snapshot state for every field", () => {
  const rng = seededRng(42);
  let prices = makeUniverse(50);
  let state = createTickDiffState();
  const consumer = newConsumer();
  let payload = makePayload(prices);

  for (let i = 0; i < 500; i++) {
    prices = jitterPrices(prices, rng);
    payload = makePayload(prices);
    if (i % 17 === 0) {
      payload.marketMinute = (payload.marketMinute + 1) % 390;
    }
    if (i === 250) payload.sessionPhase = "CLOSING_AUCTION";
    const { diff, nextState } = buildTickDiff(payload, state, i * 250);
    state = nextState;
    applyDiff(consumer, diff);
  }

  for (const [sym, expected] of Object.entries(payload.prices)) {
    const actual = consumer.prices[sym];
    assert(
      actual !== undefined && Math.abs(actual - expected) < 1e-6,
      `prices drift on ${sym}: expected ${expected}, got ${actual}`,
    );
    const expectedVol = payload.volumes[sym];
    const actualVol = consumer.volumes[sym];
    assert(
      actualVol !== undefined && Math.abs(actualVol - expectedVol) < 1e-6,
      `volumes drift on ${sym}: expected ${expectedVol}, got ${actualVol}`,
    );
    const expectedOpen = payload.openPrices[sym];
    const actualOpen = consumer.openPrices[sym];
    assert(
      actualOpen !== undefined && Math.abs(actualOpen - expectedOpen) < 1e-6,
      `openPrices drift on ${sym}: expected ${expectedOpen}, got ${actualOpen}`,
    );
  }
  assertEquals(consumer.marketMinute, payload.marketMinute);
  assertEquals(consumer.sessionPhase, payload.sessionPhase);
});

Deno.test("orderBook is emitted around the BOOK_MATERIAL_BPS gate boundary", () => {
  const state = createTickDiffState();
  const initial = makePayload({ AAPL: 100 });
  const { nextState } = buildTickDiff(initial, state, 1_000);

  const justBelow = makePayload({
    AAPL: 100 * (1 + (BOOK_MATERIAL_BPS - 0.5) / 10_000),
  });
  const { diff: belowDiff, nextState: afterBelow } = buildTickDiff(
    justBelow,
    nextState,
    1_250,
  );
  assert(
    belowDiff.orderBook === undefined,
    `expected no book under ${BOOK_MATERIAL_BPS} bps move, got ${JSON.stringify(belowDiff.orderBook)}`,
  );

  const justAbove = makePayload({
    AAPL: 100 * (1 + (BOOK_MATERIAL_BPS + 0.5) / 10_000),
  });
  const { diff: aboveDiff } = buildTickDiff(justAbove, afterBelow, 1_500);
  assert(
    aboveDiff.orderBook?.AAPL !== undefined,
    `expected book at or above ${BOOK_MATERIAL_BPS} bps move`,
  );
});

Deno.test("volumes diff is independent of price movement", () => {
  const state = createTickDiffState();
  const initial = makePayload({ AAPL: 100 });
  initial.volumes = { AAPL: 1_000 };
  const { nextState } = buildTickDiff(initial, state, 1_000);

  const samePrice = makePayload({ AAPL: 100 });
  samePrice.volumes = { AAPL: 2_500 };
  const { diff } = buildTickDiff(samePrice, nextState, 1_250);

  assert(diff.prices === undefined, "price unchanged should produce no prices diff");
  assertEquals(diff.volumes, { AAPL: 2_500 });
});

Deno.test("buildTickDiff never produces a full snapshot more often than the configured interval", () => {
  const rng = seededRng(7);
  let prices = makeUniverse(30);
  let state = createTickDiffState();
  const fullSnapshotTimestamps: number[] = [];

  for (let t = 0; t < 4 * 60 * 5; t++) {
    const now = t * 250;
    prices = jitterPrices(prices, rng);
    const { diff, nextState } = buildTickDiff(makePayload(prices), state, now);
    state = nextState;
    if (diff.full) fullSnapshotTimestamps.push(now);
  }

  for (let i = 1; i < fullSnapshotTimestamps.length; i++) {
    const gap = fullSnapshotTimestamps[i] - fullSnapshotTimestamps[i - 1];
    assert(
      gap >= FULL_SNAPSHOT_INTERVAL_MS,
      `full snapshot gap ${gap}ms < FULL_SNAPSHOT_INTERVAL_MS`,
    );
  }
});
