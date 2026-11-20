import { afterAll, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

const state = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  files: {} as Record<string, string>,
  writes: {} as Record<string, string>,
  alpha: {
    id: "alpha-vantage",
    label: "Alpha Vantage",
    description: "alpha",
    requiresApiKey: true,
    apiKeyConfigured: true,
    togglable: true,
    fetchQuote: vi.fn(),
    seedHistory: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("node:fs/promises", () => ({
  readFile: (path: string) =>
    path in state.files ? Promise.resolve(state.files[path]) : Promise.reject(new Error("ENOENT")),
  writeFile: (path: string, data: string) => {
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
vi.mock("../market-data/providers/tiingo.ts", () => ({
  tiingoProvider: { ...state.alpha, id: "tiingo", apiKeyConfigured: false, seedHistory: undefined },
}));
vi.mock("../market-data/providers/polygon.ts", () => ({
  polygonProvider: { ...state.alpha, id: "polygon", apiKeyConfigured: false },
  openPolygonStream: () => () => {},
}));

const startup = {
  fetched: [] as unknown[],
  seeded: 0,
  budgetFile: "",
};

const quote = (symbol: string) => ({ symbol, price: 100, fetchedAt: Date.now(), stale: false });
const fetched = () => state.alpha.fetchQuote.mock.calls.map((c: unknown[]) => c[0]);

async function health() {
  assert(state.handler);
  return (await state.handler(new Request("http://md/health"))).json();
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  vi.stubEnv("ALPHA_VANTAGE_KEY", "key");
  vi.stubEnv("ALPHA_VANTAGE_DAILY_LIMIT", "2");
  state.files["market_data_overrides.json"] = JSON.stringify({
    AAPL: "alpha-vantage",
    MSFT: "alpha-vantage",
    NVDA: "alpha-vantage",
  });
  state.alpha.fetchQuote.mockImplementation((sym: string) => Promise.resolve(quote(sym)));
  await import("../market-data/market-data-service.ts");
  await vi.advanceTimersByTimeAsync(10_000);
  startup.fetched = fetched();
  startup.seeded = state.alpha.seedHistory.mock.calls.length;
  startup.budgetFile = state.writes["market_data_budget.json"];
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("[market-data budget] startup fetches stop at the daily limit and skip intraday history", async () => {
  assertEquals(startup.fetched, ["AAPL", "MSFT"]);
  assertEquals(startup.seeded, 0);
  assertEquals(JSON.parse(startup.budgetFile), {
    day: "2026-11-20",
    used: 2,
  });
  assertEquals((await health()).alphaVantageCallsRemaining, 0);
});

test("[market-data budget] no calls are made once the budget is spent", async () => {
  state.alpha.fetchQuote.mockClear();
  await vi.advanceTimersByTimeAsync(6 * 3_600_000);
  assertEquals(fetched().length, 0);
});

test("[market-data budget] the budget resets at UTC midnight and the oldest symbol is refreshed first", async () => {
  state.alpha.fetchQuote.mockClear();
  await vi.advanceTimersByTimeAsync(12 * 3_600_000);
  assertEquals(fetched(), ["NVDA"]);
  assertEquals((await health()).alphaVantageCallsRemaining, 1);
});

test("[market-data budget] quotes stay fresh for a full refresh cycle rather than five minutes", async () => {
  assert(state.handler);
  const cache = await (await state.handler(new Request("http://md/cache"))).json();
  assertEquals(cache.NVDA.stale, false);
});
