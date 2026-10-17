import { afterAll, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

const state = vi.hoisted(() => {
  const makeProvider = (id: string) => ({
    id,
    label: id.toUpperCase(),
    description: `${id} provider`,
    requiresApiKey: true,
    apiKeyConfigured: true,
    togglable: true,
    fetchQuote: vi.fn(),
  });
  return {
    handler: undefined as undefined | Handler,
    files: {} as Record<string, string>,
    writes: {} as Record<string, string>,
    alpha: {
      ...makeProvider("alpha-vantage"),
      seedHistory: vi.fn((_symbol: string, _journalUrl: string) => Promise.resolve()),
    },
    tiingo: { ...makeProvider("tiingo"), apiKeyConfigured: false },
    polygon: makeProvider("polygon"),
    openStream: vi.fn(),
    teardown: vi.fn(),
    streamHandler: undefined as undefined | ((q: unknown) => void),
  };
});

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("node:fs/promises", () => ({
  readFile: (path: string) =>
    path in state.files ? Promise.resolve(state.files[path]) : Promise.reject(new Error("ENOENT")),
  writeFile: (path: string, data: string) => {
    if (path.includes("feed_state") && state.files.failWrite) {
      return Promise.reject(new Error("disk full"));
    }
    state.writes[path] = data;
    return Promise.resolve();
  },
}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    state.handler = handler;
  },
}));
vi.mock("../market-data/providers/alpha-vantage-equity.ts", () => ({
  alphaVantageProvider: state.alpha,
}));
vi.mock("../market-data/providers/tiingo.ts", () => ({ tiingoProvider: state.tiingo }));
vi.mock("../market-data/providers/polygon.ts", () => ({
  polygonProvider: state.polygon,
  openPolygonStream: (symbols: string[], onQuote: (q: unknown) => void) => {
    state.openStream(symbols);
    state.streamHandler = onQuote;
    return state.teardown;
  },
}));

const startup = {
  seeded: [] as unknown[],
  fetched: [] as unknown[],
  streamSymbols: undefined as unknown,
};

function quote(symbol: string, extra: Record<string, unknown> = {}) {
  return { symbol, price: 100, fetchedAt: Date.now(), stale: false, ...extra };
}

async function call(method: string, path: string, body?: unknown) {
  assert(state.handler);
  return state.handler(
    new Request(`http://md${path}`, {
      method,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  vi.stubEnv("ALPHA_VANTAGE_KEY", "key");
  vi.stubEnv("POLYGON_KEY", "pkey");
  state.files["market_data_overrides.json"] = JSON.stringify({
    AAPL: "alpha-vantage-fx",
    MSFT: "alpha-vantage",
    TSLA: "polygon",
  });
  state.files["market_data_feed_state.json"] = JSON.stringify({ feedPaused: true });
  state.alpha.fetchQuote.mockImplementation((sym: string) => Promise.resolve(quote(sym)));
  await import("../market-data/market-data-service.ts");
  await vi.advanceTimersByTimeAsync(10_000);
  startup.seeded = state.alpha.seedHistory.mock.calls.map((c: unknown[]) => c[0]);
  startup.fetched = state.alpha.fetchQuote.mock.calls.map((c: unknown[]) => c[0]);
  startup.streamSymbols = state.openStream.mock.calls[0]?.[0];
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("[market-data] loads persisted overrides, mapping the legacy FX source name", async () => {
  const body = await (await call("GET", "/overrides")).json();
  assertEquals(body.overrides, { AAPL: "alpha-vantage", MSFT: "alpha-vantage", TSLA: "polygon" });
});

test("[market-data] a legacy paused flag pauses alpha vantage only", async () => {
  const health = await (await call("GET", "/health")).json();
  assertEquals(health.pausedSources, ["alpha-vantage"]);
  assertEquals(health.overrides, 3);
  assertEquals(health.alphaVantageConfigured, true);
  assertEquals(health.cachedQuotes, 2);
});

test("[market-data] seeds history and a first quote for alpha vantage symbols on startup", () => {
  assertEquals(startup.seeded, ["AAPL", "MSFT"]);
  assertEquals(startup.fetched, ["AAPL", "MSFT"]);
});

test("[market-data] opens the polygon stream for polygon symbols and caches streamed quotes", async () => {
  assertEquals(startup.streamSymbols, ["TSLA"]);
  assert(state.streamHandler);
  state.streamHandler(quote("TSLA", { price: 250 }));
  const cached = await (await call("GET", "/quote/tsla")).json();
  assertEquals(cached.price, 250);
});

test("[market-data] lists sources with their configuration and state", async () => {
  const sources = await (await call("GET", "/sources")).json();
  assertEquals(
    sources.map((s: { id: string }) => s.id),
    ["synthetic", "alpha-vantage", "tiingo", "polygon"]
  );
  const byId = Object.fromEntries(sources.map((s: { id: string }) => [s.id, s]));
  assertEquals(byId.synthetic.active, true);
  assertEquals(byId["alpha-vantage"].active, false);
  assertEquals(byId["alpha-vantage"].mode, "polling");
  assertEquals(byId["alpha-vantage"].pollIntervalMs, 300_000);
  assertEquals(byId.tiingo.enabled, false);
  assertEquals(byId.polygon.mode, "streaming");
  assertEquals(byId.polygon.pollIntervalMs, undefined);
});

test("[market-data] toggling validates the source and persists the paused set", async () => {
  assertEquals((await call("POST", "/sources/synthetic/toggle")).status, 400);
  state.polygon.togglable = false;
  assertEquals((await call("POST", "/sources/polygon/toggle")).status, 400);
  state.polygon.togglable = true;

  const resumed = await (await call("POST", "/sources/alpha-vantage/toggle")).json();
  assertEquals(resumed.find((s: { id: string }) => s.id === "alpha-vantage").active, true);
  assertEquals(JSON.parse(state.writes["market_data_feed_state.json"]), { pausedSources: [] });
});

test("[market-data] pausing and resuming polygon tears down and restarts its stream", async () => {
  state.teardown.mockClear();
  state.openStream.mockClear();
  await call("POST", "/sources/polygon/toggle");
  assertEquals(state.teardown.mock.calls.length, 1);
  assertEquals(state.openStream.mock.calls.length, 0);

  await call("POST", "/sources/polygon/toggle");
  assertEquals(state.openStream.mock.calls.length, 1);
  assertEquals(state.teardown.mock.calls.length, 1);
});

test("[market-data] survives a failure to persist feed state", async () => {
  state.files.failWrite = "1";
  assertEquals((await call("POST", "/sources/tiingo/toggle")).status, 200);
  delete state.files.failWrite;
  await call("POST", "/sources/tiingo/toggle");
});

test("[market-data] serves cached quotes and explains missing ones", async () => {
  assertEquals((await call("GET", "/quote/aapl")).status, 200);
  assertEquals((await call("GET", "/quote/%E0%A4%A")).status, 400);

  const unconfigured = await call("GET", "/quote/NVDA");
  assertEquals(unconfigured.status, 404);
  assert((await unconfigured.json()).error.includes("not configured"));

  const body = await (await call("GET", "/cache")).json();
  assert("AAPL" in body);
});

test("[market-data] a quote request for an uncached symbol triggers a provider fetch", async () => {
  await call("PUT", "/overrides", { overrides: { NVDA: "alpha-vantage" } });
  await vi.advanceTimersByTimeAsync(0);
  const cachedByPut = await call("GET", "/quote/NVDA");
  assertEquals(cachedByPut.status, 200);
});

test("[market-data] validates override updates", async () => {
  assertEquals((await call("PUT", "/overrides", "{bad")).status, 400);
  assertEquals((await call("PUT", "/overrides", {})).status, 400);
  const unknown = await call("PUT", "/overrides", { overrides: { AAPL: "bogus" } });
  assertEquals(unknown.status, 400);
  assert((await unknown.json()).error.includes("bogus"));
});

test("[market-data] override updates drop synthetic entries, persist and fetch new symbols", async () => {
  state.alpha.fetchQuote.mockClear();
  state.alpha.seedHistory.mockClear();
  const res = await call("PUT", "/overrides", {
    overrides: { AMZN: "alpha-vantage", GOOG: "synthetic", TSLA: "polygon", IBM: "tiingo" },
  });
  assertEquals((await res.json()).overrides, {
    AMZN: "alpha-vantage",
    TSLA: "polygon",
    IBM: "tiingo",
  });
  assertEquals(JSON.parse(state.writes["market_data_overrides.json"]).AMZN, "alpha-vantage");
  assertEquals(state.alpha.fetchQuote.mock.calls[0][0], "AMZN");
  assertEquals(state.alpha.seedHistory.mock.calls[0][0], "AMZN");
  assertEquals(state.tiingo.fetchQuote.mock.calls.length, 0);
});

test("[market-data] the poll loop refreshes one symbol per provider and flags failures as stale", async () => {
  state.alpha.fetchQuote.mockClear();
  state.alpha.fetchQuote.mockResolvedValueOnce(null);
  await vi.advanceTimersByTimeAsync(300_000);
  assertEquals(state.alpha.fetchQuote.mock.calls.length, 1);
  const cached = await (await call("GET", "/cache")).json();
  const polled = state.alpha.fetchQuote.mock.calls[0][0];
  assertEquals(cached[polled]?.stale, true);

  state.alpha.fetchQuote.mockRejectedValueOnce(new Error("rate limited"));
  await vi.advanceTimersByTimeAsync(300_000);
  assertEquals(state.alpha.fetchQuote.mock.calls.length, 2);
});

test("[market-data] the poll loop skips paused providers", async () => {
  await call("POST", "/sources/alpha-vantage/toggle");
  state.alpha.fetchQuote.mockClear();
  await vi.advanceTimersByTimeAsync(300_000);
  assertEquals(state.alpha.fetchQuote.mock.calls.length, 0);
  await call("POST", "/sources/alpha-vantage/toggle");
});

test("[market-data] marks quotes stale once they outlive the cache ttl", async () => {
  state.alpha.fetchQuote.mockResolvedValue(null);
  state.streamHandler?.(quote("TSLA", { price: 260 }));
  await vi.advanceTimersByTimeAsync(330_000);
  const cached = await (await call("GET", "/cache")).json();
  assertEquals(cached.TSLA.stale, true);
});

test("[market-data] answers preflight and unknown routes", async () => {
  assertEquals((await call("OPTIONS", "/overrides")).status, 204);
  assertEquals((await call("GET", "/nothing")).status, 404);
});
