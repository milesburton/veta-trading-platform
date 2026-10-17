import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals, assertRejects } from "#veta/test-assert";
import { DEFAULT_WEIGHTS, type WeightStore } from "../signal-engine/weight-store.ts";

const h = vi.hoisted(() => ({
  getEvents: vi.fn(),
  requested: [] as string[],
}));

vi.mock("#veta/db", () => ({ intelligencePool: {} }));
vi.mock("../market-data-adapters/market-event-store.ts", () => ({
  createMarketEventStore: () => ({ getEvents: h.getEvents }),
}));

const { runReplay } = await import("../signal-engine/replay-server.ts");

const weightStore: WeightStore = {
  getWeights: () => Promise.resolve(DEFAULT_WEIGHTS),
  saveWeights: () => Promise.resolve(),
};

function candles(count: number, start = 1_000_000_000) {
  return Array.from({ length: count }, (_, i) => ({
    time: start + i * 60_000,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100 + i * 0.2,
    volume: 1_000 + i,
  }));
}

function serve(body: unknown, status = 200) {
  vi.stubGlobal("fetch", (input: string) => {
    h.requested.push(String(input));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  });
}

beforeEach(() => {
  h.requested.length = 0;
  h.getEvents.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("[signal-replay] scores every candle inside the requested window", async () => {
  const data = candles(40);
  serve([...data].reverse());
  const from = data[10].time;
  const frames = await runReplay("AAPL", from, data[39].time, weightStore);

  assertEquals(frames.length, 30);
  assertEquals(frames[0].ts, from);
  assert(frames.every((f, i) => i === 0 || f.ts > frames[i - 1].ts));
  assertEquals(frames[0].close, data[10].close);
  assertEquals(frames[0].signal.symbol, "AAPL");
});

test("[signal-replay] asks the journal for warm-up candles before the window", async () => {
  const data = candles(5);
  serve(data);
  await runReplay("BRK.B", data[2].time, data[4].time, weightStore);
  const url = new URL(h.requested[0]);
  assertEquals(url.searchParams.get("instrument"), "BRK.B");
  assertEquals(url.searchParams.get("interval"), "1m");
  assertEquals(Number(url.searchParams.get("from")), data[2].time - 25 * 60_000);
  assertEquals(Number(url.searchParams.get("to")), data[4].time);
});

test("[signal-replay] tolerates a failing event store and long histories", async () => {
  h.getEvents.mockRejectedValue(new Error("db down"));
  const data = candles(150);
  serve(data);
  const frames = await runReplay("AAPL", data[0].time, data[149].time, weightStore);
  assertEquals(frames.length, 150);
});

test("[signal-replay] fails clearly when the journal errors or has too little data", async () => {
  serve({}, 500);
  await assertRejects(
    () => runReplay("AAPL", 1, 2, weightStore),
    Error,
    "Failed to fetch candles: Journal returned 500"
  );

  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  await assertRejects(
    () => runReplay("AAPL", 1, 2, weightStore),
    Error,
    "Failed to fetch candles: offline"
  );

  serve(candles(1));
  await assertRejects(
    () => runReplay("AAPL", 1, 2, weightStore),
    Error,
    "Insufficient candle data for AAPL"
  );
});
