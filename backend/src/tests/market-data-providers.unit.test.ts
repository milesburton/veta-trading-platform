import { afterEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { CachedQuote, ProviderDef } from "../market-data/providers/types.ts";

const KEY_VARS = ["POLYGON_KEY", "TIINGO_KEY", "ALPHA_VANTAGE_KEY"] as const;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", (input: Request | URL | string, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return Promise.resolve(handler(call));
  });
  return calls;
}

function failingFetch(): void {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
}

async function load<T>(path: string, env: Partial<Record<(typeof KEY_VARS)[number], string>>) {
  vi.resetModules();
  for (const name of KEY_VARS) delete process.env[name];
  for (const [name, value] of Object.entries(env)) process.env[name] = value;
  return (await import(path)) as T;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const name of KEY_VARS) delete process.env[name];
});

type PolygonModule = {
  polygonProvider: ProviderDef;
  openPolygonStream: (
    symbols: string[],
    onQuote: (quote: CachedQuote) => void,
    apiKey?: string
  ) => () => void;
};

const POLYGON = "../market-data/providers/polygon.ts";
const TIINGO = "../market-data/providers/tiingo.ts";
const ALPHA = "../market-data/providers/alpha-vantage-equity.ts";

test("[polygon] fetchQuote returns null and never calls the network without a key", async () => {
  const calls = stubFetch(() => json({}));
  const { polygonProvider } = await load<PolygonModule>(POLYGON, {});
  assertEquals(polygonProvider.apiKeyConfigured, false);
  assertEquals(await polygonProvider.fetchQuote("AAPL", ""), null);
  assertEquals(calls.length, 0);
});

test("[polygon] fetchQuote maps the last trade to a quote dated from the trade timestamp", async () => {
  const calls = stubFetch(() => json({ results: { p: 191.25, t: Date.UTC(2026, 5, 3, 14, 30) } }));
  const { polygonProvider } = await load<PolygonModule>(POLYGON, { POLYGON_KEY: "k1" });
  const quote = await polygonProvider.fetchQuote("BRK/B", "");
  assertEquals(polygonProvider.apiKeyConfigured, true);
  assertEquals(calls[0].url, "https://api.polygon.io/v2/last/trade/BRK%2FB?apiKey=k1");
  assertEquals(quote?.price, 191.25);
  assertEquals(quote?.latestTradingDay, "2026-06-03");
  assertEquals(quote?.stale, false);
});

test("[polygon] fetchQuote falls back to today when the trade has no timestamp", async () => {
  stubFetch(() => json({ results: { p: 10 } }));
  const { polygonProvider } = await load<PolygonModule>(POLYGON, { POLYGON_KEY: "k1" });
  const quote = await polygonProvider.fetchQuote("AAPL", "");
  assertEquals(quote?.latestTradingDay, new Date().toISOString().slice(0, 10));
});

test("[polygon] fetchQuote returns null for missing, non-positive and failed responses", async () => {
  const { polygonProvider } = await load<PolygonModule>(POLYGON, { POLYGON_KEY: "k1" });
  stubFetch(() => json({}));
  assertEquals(await polygonProvider.fetchQuote("AAPL", ""), null);
  stubFetch(() => json({ results: { p: 0 } }));
  assertEquals(await polygonProvider.fetchQuote("AAPL", ""), null);
  stubFetch(() => json({}, 429));
  assertEquals(await polygonProvider.fetchQuote("AAPL", ""), null);
  failingFetch();
  assertEquals(await polygonProvider.fetchQuote("AAPL", ""), null);
});

test("[polygon] supportsSymbol rejects FX pairs", async () => {
  const { polygonProvider } = await load<PolygonModule>(POLYGON, {});
  assertEquals(polygonProvider.supportsSymbol("AAPL"), true);
  assertEquals(polygonProvider.supportsSymbol("EUR/USD"), false);
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

function installFakeSocket(): void {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
}

test("[polygon] openPolygonStream is a no-op without a key or symbols", async () => {
  installFakeSocket();
  const { openPolygonStream } = await load<PolygonModule>(POLYGON, {});
  openPolygonStream(["AAPL"], () => {}, "")();
  openPolygonStream([], () => {}, "k1")();
  assertEquals(FakeSocket.instances.length, 0);
});

test("[polygon] openPolygonStream authenticates, subscribes and forwards trades", async () => {
  installFakeSocket();
  const { openPolygonStream } = await load<PolygonModule>(POLYGON, {});
  const quotes: CachedQuote[] = [];
  const stop = openPolygonStream(["AAPL", "MSFT"], (q) => quotes.push(q), "k1");
  const socket = FakeSocket.instances[0];
  assertEquals(socket.url, "wss://delayed.polygon.io/stocks");

  socket.onopen?.();
  assertEquals(JSON.parse(socket.sent[0]), { action: "auth", params: "k1" });

  socket.receive([{ ev: "connected" }, { ev: "auth_success" }]);
  assertEquals(JSON.parse(socket.sent[1]), { action: "subscribe", params: "T.AAPL,T.MSFT" });

  socket.receive([
    { ev: "T", sym: "AAPL", p: 190.5, s: 100, t: Date.UTC(2026, 5, 3) },
    { ev: "T", sym: "MSFT", p: 0 },
    { ev: "T", sym: "NVDA", p: 900 },
    { ev: "T", p: 1 },
    { ev: "status" },
  ]);
  socket.onmessage?.({ data: "not json" } as MessageEvent);
  socket.onerror?.({ message: "boom" });

  assertEquals(
    quotes.map((q) => [q.symbol, q.price, q.volume, q.latestTradingDay]),
    [
      ["AAPL", 190.5, 100, "2026-06-03"],
      ["NVDA", 900, 0, new Date().toISOString().slice(0, 10)],
    ]
  );

  stop();
  assertEquals(socket.closed, true);
});

test("[polygon] openPolygonStream closes on auth failure and reconnects after an unexpected close", async () => {
  vi.useFakeTimers();
  installFakeSocket();
  const { openPolygonStream } = await load<PolygonModule>(POLYGON, {});
  const stop = openPolygonStream(["AAPL"], () => {}, "k1");

  const first = FakeSocket.instances[0];
  first.receive([{ ev: "auth_failed" }]);
  assertEquals(first.closed, true);

  first.onclose?.();
  assertEquals(FakeSocket.instances.length, 1);
  vi.advanceTimersByTime(10_000);
  assertEquals(FakeSocket.instances.length, 2);

  stop();
  FakeSocket.instances[1].onclose?.();
  vi.advanceTimersByTime(10_000);
  assertEquals(FakeSocket.instances.length, 2);
});

type TiingoModule = { tiingoProvider: ProviderDef };

test("[tiingo] fetchQuote returns null without a key", async () => {
  const calls = stubFetch(() => json([]));
  const { tiingoProvider } = await load<TiingoModule>(TIINGO, {});
  assertEquals(tiingoProvider.apiKeyConfigured, false);
  assertEquals(await tiingoProvider.fetchQuote("AAPL", ""), null);
  assertEquals(calls.length, 0);
  assertEquals(tiingoProvider.supportsSymbol("EUR/USD"), true);
});

test("[tiingo] equity quotes use the IEX endpoint and the sale timestamp date", async () => {
  const calls = stubFetch(() => json([{ last: 55.5, lastSaleTimestamp: "2026-06-02T19:59:00Z" }]));
  const { tiingoProvider } = await load<TiingoModule>(TIINGO, { TIINGO_KEY: "tk" });
  const quote = await tiingoProvider.fetchQuote("AAPL", "");
  assertEquals(calls[0].url, "https://api.tiingo.com/iex/aapl?token=tk");
  assertEquals(quote?.price, 55.5);
  assertEquals(quote?.latestTradingDay, "2026-06-02");
});

test("[tiingo] equity quotes without a sale timestamp are dated today", async () => {
  stubFetch(() => json([{ last: 5 }]));
  const { tiingoProvider } = await load<TiingoModule>(TIINGO, { TIINGO_KEY: "tk" });
  const quote = await tiingoProvider.fetchQuote("AAPL", "");
  assertEquals(quote?.latestTradingDay, new Date().toISOString().slice(0, 10));
});

test("[tiingo] FX pairs use the top-of-book endpoint and the mid price", async () => {
  const calls = stubFetch(() => json([{ midPrice: 1.0825 }]));
  const { tiingoProvider } = await load<TiingoModule>(TIINGO, { TIINGO_KEY: "tk" });
  const quote = await tiingoProvider.fetchQuote("EUR/USD", "");
  assertEquals(calls[0].url, "https://api.tiingo.com/tiingo/fx/eurusd/top?token=tk");
  assertEquals(quote?.price, 1.0825);
  assertEquals(quote?.symbol, "EUR/USD");
});

test("[tiingo] empty, non-positive, non-OK and failed responses return null", async () => {
  const { tiingoProvider } = await load<TiingoModule>(TIINGO, { TIINGO_KEY: "tk" });
  for (const symbol of ["AAPL", "EUR/USD"]) {
    stubFetch(() => json([]));
    assertEquals(await tiingoProvider.fetchQuote(symbol, ""), null);
    stubFetch(() => json([{ last: 0, midPrice: 0 }]));
    assertEquals(await tiingoProvider.fetchQuote(symbol, ""), null);
    stubFetch(() => json({}, 500));
    assertEquals(await tiingoProvider.fetchQuote(symbol, ""), null);
    failingFetch();
    assertEquals(await tiingoProvider.fetchQuote(symbol, ""), null);
  }
});

type AlphaModule = { alphaVantageProvider: ProviderDef };

test("[alpha-vantage] every fetch is skipped without a key", async () => {
  const calls = stubFetch(() => json({}));
  const { alphaVantageProvider } = await load<AlphaModule>(ALPHA, {});
  assertEquals(alphaVantageProvider.apiKeyConfigured, false);
  assertEquals(await alphaVantageProvider.fetchQuote("AAPL", ""), null);
  assertEquals(await alphaVantageProvider.fetchQuote("EUR/USD", ""), null);
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");
  assertEquals(calls.length, 0);
});

test("[alpha-vantage] equity quotes parse the GLOBAL_QUOTE payload", async () => {
  const calls = stubFetch(() =>
    json({
      "Global Quote": {
        "05. price": "101.50",
        "06. volume": "12345",
        "07. latest trading day": "2026-06-02",
      },
    })
  );
  const { alphaVantageProvider } = await load<AlphaModule>(ALPHA, { ALPHA_VANTAGE_KEY: "ak" });
  const quote = await alphaVantageProvider.fetchQuote("AAPL", "");
  assert(calls[0].url.includes("function=GLOBAL_QUOTE&symbol=AAPL&apikey=ak"));
  assertEquals(quote?.price, 101.5);
  assertEquals(quote?.volume, 12345);
  assertEquals(quote?.latestTradingDay, "2026-06-02");
});

test("[alpha-vantage] FX quotes parse the exchange rate and reject malformed pairs", async () => {
  const calls = stubFetch(() =>
    json({
      "Realtime Currency Exchange Rate": {
        "5. Exchange Rate": "1.0900",
        "6. Last Refreshed": "2026-06-02 10:00:00",
      },
    })
  );
  const { alphaVantageProvider } = await load<AlphaModule>(ALPHA, { ALPHA_VANTAGE_KEY: "ak" });
  const quote = await alphaVantageProvider.fetchQuote("EUR/USD", "");
  assert(calls[0].url.includes("from_currency=EUR&to_currency=USD"));
  assertEquals(quote?.price, 1.09);
  assertEquals(quote?.latestTradingDay, "2026-06-02 10:00:00");

  const before = calls.length;
  assertEquals(await alphaVantageProvider.fetchQuote("EUR/USD/JPY", ""), null);
  assertEquals(await alphaVantageProvider.fetchQuote("/USD", ""), null);
  assertEquals(calls.length, before);
});

test("[alpha-vantage] rate-limited, non-positive, non-OK and failed responses return null", async () => {
  const { alphaVantageProvider } = await load<AlphaModule>(ALPHA, { ALPHA_VANTAGE_KEY: "ak" });
  for (const symbol of ["AAPL", "EUR/USD"]) {
    stubFetch(() => json({ Note: "rate limited" }));
    assertEquals(await alphaVantageProvider.fetchQuote(symbol, ""), null);
    stubFetch(() =>
      json({
        "Global Quote": { "05. price": "0" },
        "Realtime Currency Exchange Rate": { "5. Exchange Rate": "0" },
      })
    );
    assertEquals(await alphaVantageProvider.fetchQuote(symbol, ""), null);
    stubFetch(() => json({}, 503));
    assertEquals(await alphaVantageProvider.fetchQuote(symbol, ""), null);
    failingFetch();
    assertEquals(await alphaVantageProvider.fetchQuote(symbol, ""), null);
  }
});

test("[alpha-vantage] seedHistory posts sorted candles to the journal", async () => {
  const calls = stubFetch((call) =>
    call.url.includes("TIME_SERIES_INTRADAY")
      ? json({
          "Time Series (1min)": {
            "2026-06-02 10:01:00": {
              "1. open": "2",
              "2. high": "3",
              "3. low": "1",
              "4. close": "2.5",
              "5. volume": "20",
            },
            "2026-06-02 10:00:00": {
              "1. open": "1",
              "2. high": "2",
              "3. low": "0.5",
              "4. close": "1.5",
              "5. volume": "10",
            },
          },
        })
      : json({}, 200)
  );
  const { alphaVantageProvider } = await load<AlphaModule>(ALPHA, { ALPHA_VANTAGE_KEY: "ak" });
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");
  const seed = calls.find((call) => call.url === "http://journal/candles/seed");
  const body = JSON.parse(String(seed?.init?.body)) as {
    symbol: string;
    candles: { open: number; volume: number; interval: string }[];
  };
  assertEquals(body.symbol, "AAPL");
  assertEquals(
    body.candles.map((c) => [c.open, c.volume, c.interval]),
    [
      [1, 10, "1m"],
      [2, 20, "1m"],
    ]
  );
});

test("[alpha-vantage] seedHistory tolerates empty data, journal rejection and fetch failure", async () => {
  const { alphaVantageProvider } = await load<AlphaModule>(ALPHA, { ALPHA_VANTAGE_KEY: "ak" });

  const noSeries = stubFetch(() => json({}));
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");
  assertEquals(noSeries.length, 1);

  const emptySeries = stubFetch(() => json({ "Time Series (1min)": {} }));
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");
  assertEquals(emptySeries.length, 1);

  const rejected = stubFetch((call) =>
    call.url.includes("TIME_SERIES_INTRADAY")
      ? json({
          "Time Series (1min)": {
            "2026-06-02 10:00:00": {
              "1. open": "1",
              "2. high": "1",
              "3. low": "1",
              "4. close": "1",
              "5. volume": "1",
            },
          },
        })
      : json({}, 500)
  );
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");
  assertEquals(rejected.length, 2);

  stubFetch(() => json({}, 500));
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");
  failingFetch();
  await alphaVantageProvider.seedHistory?.("AAPL", "http://journal");

  const fx = stubFetch(() => json({}));
  await alphaVantageProvider.seedHistory?.("EUR/USD", "http://journal");
  assertEquals(fx.length, 0);
});
