import { afterAll, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

interface ServiceConfig {
  health: () => Record<string, unknown>;
  handler: (req: Request, url: URL, path: string) => Response | Promise<Response>;
}
type Listener = (topic: string, raw: unknown) => void;

const h = vi.hoisted(() => ({
  config: undefined as undefined | ServiceConfig,
  listeners: {} as Record<string, Listener>,
  published: [] as Array<{ topic: string; values: unknown[] }>,
  touch: vi.fn(),
  store: {
    startCleanup: vi.fn(),
    insertBatch: vi.fn(),
    getHistory: vi.fn(),
    getLatest: vi.fn(),
  },
  candles: { value: [] as unknown[], ok: true },
  requested: [] as string[],
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/db", () => ({ intelligencePool: {} }));
vi.mock("#veta/wait-for", () => ({ waitForUrl: () => Promise.resolve(false) }));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveJsonService: (config: ServiceConfig) => {
    h.config = config;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () => Promise.resolve({ send: () => Promise.resolve() }),
  createConsumer: (group: string) =>
    Promise.resolve({
      onMessage: (fn: Listener) => {
        h.listeners[group] = fn;
      },
    }),
  sendInChunks: (_producer: unknown, topic: string, values: unknown[]) => {
    h.published.push({ topic, values });
    return Promise.resolve();
  },
}));
vi.mock("../shared/idle-exit.ts", () => ({ armConsumerIdleExit: () => ({ touch: h.touch }) }));
vi.mock("../feature-engine/feature-store.ts", () => ({ createFeatureStore: () => h.store }));

async function call(path: string) {
  assert(h.config);
  const url = new URL(`http://fe${path}`);
  return h.config.handler(new Request(url), url, url.pathname);
}

const startup = { cleanups: 0 };

function health(): Record<string, number> {
  assert(h.config);
  return h.config.health() as Record<string, number>;
}

function tick(prices: Record<string, number>, volumes?: Record<string, number>) {
  h.listeners["feature-engine-ticks"]("market.ticks", { prices, volumes });
}

async function flush(ms = 250) {
  await vi.advanceTimersByTimeAsync(ms);
}

function published() {
  return h.published.flatMap((p) => p.values) as Array<{
    symbol: string;
    momentum: number;
    eventScore: number;
    newsVelocity: number;
  }>;
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  h.store.insertBatch.mockResolvedValue(undefined);
  h.store.getHistory.mockResolvedValue([{ ts: 1 }]);
  h.store.getLatest.mockResolvedValue(null);
  vi.stubGlobal("fetch", (input: string) => {
    const url = String(input);
    h.requested.push(url);
    if (url.endsWith("/assets")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { symbol: "AAPL", sector: "Tech" },
            { symbol: "MSFT", sector: "Tech" },
            { symbol: "XOM", sector: "Energy" },
            { sector: "Orphan" },
          ])
        )
      );
    }
    if (url.includes("/candles")) {
      return h.candles.ok
        ? Promise.resolve(new Response(JSON.stringify(h.candles.value)))
        : Promise.resolve(new Response("{}", { status: 500 }));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
  h.candles.value = Array.from({ length: 30 }, (_, i) => ({ close: 100 + Math.sin(i) * 3 }));
  await import("../feature-engine/feature-engine.ts");
  await vi.advanceTimersByTimeAsync(0);
  startup.cleanups = h.store.startCleanup.mock.calls.length;
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("[feature-engine] starts the store cleanup and reports empty health", () => {
  assertEquals(startup.cleanups, 1);
  assert(h.config);
  assertEquals(h.config.health(), {
    trackedSymbols: 0,
    cachedVolSymbols: 0,
    recentNewsCount: 0,
    upcomingEventCount: 0,
  });
});

test("[feature-engine] ignores malformed ticks and zero prices", async () => {
  h.listeners["feature-engine-ticks"]("market.ticks", {});
  h.listeners["feature-engine-ticks"]("market.ticks", { prices: "x" });
  tick({ AAPL: 0 });
  await flush();
  assertEquals(h.published.length, 0);
});

test("[feature-engine] builds feature vectors from ticks and publishes them in batches", async () => {
  tick({ AAPL: 100, MSFT: 200 }, { AAPL: 1_000 });
  assertEquals(h.published.length, 0);
  tick({ AAPL: 101, MSFT: 202 }, { AAPL: 1_100 });
  await flush();

  const batch = h.published[0];
  assertEquals(batch.topic, "market.features");
  assertEquals(
    published()
      .map((f) => f.symbol)
      .sort(),
    ["AAPL", "MSFT"]
  );
  assertEquals(h.store.insertBatch.mock.calls[0][0].length, 2);
  assertEquals(h.touch.mock.calls.length, 2);
});

test("[feature-engine] serves the latest features from memory, then the store, then 404", async () => {
  const live = await (await call("/features/AAPL")).json();
  assertEquals(live.symbol, "AAPL");

  h.store.getLatest.mockResolvedValueOnce({ symbol: "TSLA", ts: 5 });
  assertEquals((await (await call("/features/TSLA")).json()).ts, 5);
  assertEquals((await call("/features/NOPE")).status, 404);
  assertEquals((await call("/features/%E0%A4%A")).status, 400);
});

test("[feature-engine] serves bounded history", async () => {
  assertEquals(await (await call("/features/AAPL/history")).json(), [{ ts: 1 }]);
  assertEquals(h.store.getHistory.mock.calls.at(-1), ["AAPL", 100]);
  await call("/features/AAPL/history?limit=9999");
  assertEquals(h.store.getHistory.mock.calls.at(-1), ["AAPL", 500]);
  assertEquals((await call("/features/%E0%A4%A/history")).status, 400);
  assertEquals((await call("/unknown")).status, 404);
});

test("[feature-engine] news and calendar events refresh the affected symbol", async () => {
  h.published.length = 0;
  h.listeners["feature-engine-news"]("news.events.normalised", { tickers: ["AAPL"] });
  h.listeners["feature-engine-news"]("news.events.normalised", {
    ts: Date.now(),
    tickers: ["AAPL", "UNKNOWN"],
    sentiment: "positive",
    sentimentScore: 0.8,
    relevanceScore: 0.8,
  });
  h.listeners["feature-engine-adapters"]("market.external.events", { ticker: "AAPL" });
  h.listeners["feature-engine-adapters"]("market.external.events", {
    ticker: "MSFT",
    scheduledAt: Date.now() + 3_600_000,
    importance: "high",
    type: "earnings",
  });
  h.listeners["feature-engine-adapters"]("market.external.events", {
    ticker: "ZZZ",
    scheduledAt: Date.now() + 1,
  });
  await flush();

  const bySymbol = Object.fromEntries(published().map((f) => [f.symbol, f]));
  assert(bySymbol.AAPL.newsVelocity > 0);
  assert("MSFT" in bySymbol);
  assertEquals(health().recentNewsCount, 1);
  assertEquals(health().upcomingEventCount, 2);
});

test("[feature-engine] expires stale news and past events on the next tick", async () => {
  await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
  tick({ AAPL: 102 });
  const snapshot = health();
  assertEquals(snapshot.recentNewsCount, 0);
  assertEquals(snapshot.upcomingEventCount, 0);
});

test("[feature-engine] refreshes realised volatility from journal candles on a rotating schedule", async () => {
  h.requested.length = 0;
  await vi.advanceTimersByTimeAsync(60_000);
  assert(h.requested.some((u) => u.includes("/candles?instrument=")));
  assert(health().cachedVolSymbols > 0);

  h.candles.ok = false;
  await vi.advanceTimersByTimeAsync(60_000);
  h.candles.value = [{ close: 100 }];
  h.candles.ok = true;
  await vi.advanceTimersByTimeAsync(60_000);
});

test("[feature-engine] backs off when the store rejects a batch, then retries and recovers", async () => {
  h.store.insertBatch.mockReset();
  h.store.insertBatch.mockRejectedValue(new Error("db down"));
  tick({ AAPL: 103 });
  await flush(250);
  assertEquals(h.store.insertBatch.mock.calls.length, 1);

  await flush(250);
  assertEquals(h.store.insertBatch.mock.calls.length, 2);

  h.store.insertBatch.mockResolvedValue(undefined);
  await flush(1_000);
  assertEquals(h.store.insertBatch.mock.calls.length, 3);

  await flush(1_000);
  assertEquals(h.store.insertBatch.mock.calls.length, 3);
});

test("[feature-engine] reloads the sector map on its interval and survives failures", async () => {
  h.requested.length = 0;
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  assert(h.requested.some((u) => u.endsWith("/assets")));
});
