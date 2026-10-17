import { afterEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  seedDividendEvents,
  seedEarningsEvents,
} from "../market-data-adapters/earnings-adapter.ts";
import { seedEconomicEvents } from "../market-data-adapters/economic-adapter.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(handler: (url: string) => Response): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", (input: Request | URL | string) => {
    urls.push(String(input));
    return Promise.resolve(handler(String(input)));
  });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("[earnings] without a key the events are synthetic, two per symbol, with rotating impact", async () => {
  vi.stubEnv("FINNHUB_KEY", "");
  const events = await seedEarningsEvents(["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"]);
  assertEquals(events.length, 10);
  assertEquals(
    events.filter((e) => e.id.endsWith("-future")).map((e) => e.impact),
    ["high", "medium", "medium", "low", "high"]
  );
  const future = events.find((e) => e.id === "earnings-AAPL-future");
  const past = events.find((e) => e.id === "earnings-AAPL-past");
  assert(future !== undefined && past !== undefined);
  assert(future.scheduledAt > Date.now());
  assert(past.scheduledAt < Date.now());
  assertEquals(future.headline, "AAPL Q1 Earnings Release (Simulated)");
});

test("[earnings] synthetic quarters advance every twenty symbols", async () => {
  vi.stubEnv("FINNHUB_KEY", "");
  const symbols = Array.from({ length: 45 }, (_, i) => `S${i}`);
  const events = await seedEarningsEvents(symbols);
  const headline = (symbol: string) =>
    events.find((e) => e.id === `earnings-${symbol}-future`)?.headline;
  assertEquals(headline("S0"), "S0 Q1 Earnings Release (Simulated)");
  assertEquals(headline("S20"), "S20 Q2 Earnings Release (Simulated)");
  assertEquals(headline("S40"), "S40 Q3 Earnings Release (Simulated)");
});

test("[earnings] with a key Finnhub results are mapped with an impact derived from the surprise", async () => {
  vi.stubEnv("FINNHUB_KEY", "fk");
  const symbols = Array.from({ length: 60 }, (_, i) => `S${i}`);
  const urls = stubFetch(() =>
    json({
      earningsCalendar: [
        {
          symbol: "AAPL",
          date: "2026-07-30",
          epsEstimate: 1,
          epsActual: 1.2,
          quarter: 3,
          year: 2026,
        },
        {
          symbol: "AAPL",
          date: "2026-10-30",
          epsEstimate: 1,
          epsActual: 1.06,
          quarter: null,
          year: null,
        },
        {
          symbol: "MSFT",
          date: "2026-07-28",
          epsEstimate: 2,
          epsActual: 2.01,
          quarter: 2,
          year: 2026,
        },
        {
          symbol: "NVDA",
          date: "2026-08-20",
          epsEstimate: 0,
          epsActual: 1,
          quarter: 1,
          year: 2026,
        },
        {
          symbol: "TSLA",
          date: "2026-09-01",
          epsEstimate: null,
          epsActual: null,
          quarter: 1,
          year: 2026,
        },
        { symbol: "", date: "2026-09-01" },
        { symbol: "AMD", date: "" },
      ],
    })
  );
  const events = await seedEarningsEvents(symbols);
  assert(urls[0].startsWith("https://finnhub.io/api/v1/calendar/earnings?"));
  assertEquals(urls[0].split("symbol=")[1].split("&")[0].split(",").length, 50);
  assertEquals(
    events.map((e) => [e.id, e.headline, e.impact]),
    [
      ["finnhub-earnings-AAPL-2026-07-30", "AAPL Q3 2026 Earnings", "high"],
      ["finnhub-earnings-AAPL-2026-10-30", "AAPL Earnings", "medium"],
      ["finnhub-earnings-MSFT-2026-07-28", "MSFT Q2 2026 Earnings", "low"],
      ["finnhub-earnings-NVDA-2026-08-20", "NVDA Q1 2026 Earnings", "medium"],
      ["finnhub-earnings-TSLA-2026-09-01", "TSLA Q1 2026 Earnings", "medium"],
    ]
  );
  assertEquals(events[0].scheduledAt, new Date("2026-07-30").getTime());
});

test("[earnings] a failing, non-OK or empty Finnhub response falls back to synthetic events", async () => {
  vi.stubEnv("FINNHUB_KEY", "fk");
  stubFetch(() => json({}, 429));
  assertEquals((await seedEarningsEvents(["AAPL"])).length, 2);
  stubFetch(() => json({ earningsCalendar: [] }));
  assertEquals((await seedEarningsEvents(["AAPL"])).length, 2);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  assertEquals((await seedEarningsEvents(["AAPL"])).length, 2);
});

test("[dividends] every second symbol gets a low-impact ex-dividend date in the future", () => {
  const events = seedDividendEvents(["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"]);
  assertEquals(
    events.map((e) => e.ticker),
    ["AAPL", "NVDA", "AMZN"]
  );
  for (const event of events) {
    assertEquals(event.type, "dividend");
    assertEquals(event.impact, "low");
    assert(event.scheduledAt > Date.now() + 2 * DAY_MS);
  }
});

test("[economic] without a key the macro calendar is synthetic and scheduled in the future", async () => {
  vi.stubEnv("FINNHUB_KEY", "");
  const events = await seedEconomicEvents();
  assertEquals(events.length, 18);
  assert(events.every((e) => e.type === "economic" && e.scheduledAt > Date.now()));
  const fomc = events.find(
    (e) => e.id === "synthetic-economic-federal-reserve-fomc-meeting-minutes"
  );
  assertEquals(fomc?.impact, "high");
});

test("[economic] with a key Finnhub events are mapped, skipping entries with bad times", async () => {
  vi.stubEnv("FINNHUB_KEY", "fk");
  const urls = stubFetch(() =>
    json({
      economicCalendar: [
        { event: "CPI YoY", time: "2026-07-14 12:30:00", country: "US", impact: "3" },
        { event: "Retail Sales", time: "2026-07-15 12:30:00", country: "", impact: "2" },
        { event: "Housing Starts", time: "2026-07-16 12:30:00", country: "US", impact: null },
        { event: "Bad Time", time: "not a date", country: "US", impact: "3" },
        { event: "", time: "2026-07-16 12:30:00", country: "US", impact: "3" },
      ],
    })
  );
  const events = await seedEconomicEvents();
  assert(urls[0].startsWith("https://finnhub.io/api/v1/calendar/economic?"));
  assertEquals(
    events.map((e) => [e.id, e.headline, e.impact]),
    [
      ["finnhub-economic-cpi-yoy-2026-07-14 12:30:00", "CPI YoY (US)", "high"],
      ["finnhub-economic-retail-sales-2026-07-15 12:30:00", "Retail Sales", "medium"],
      ["finnhub-economic-housing-starts-2026-07-16 12:30:00", "Housing Starts (US)", "low"],
    ]
  );
});

test("[economic] a failing, non-OK or empty Finnhub response falls back to the synthetic calendar", async () => {
  vi.stubEnv("FINNHUB_KEY", "fk");
  stubFetch(() => json({}, 500));
  assertEquals((await seedEconomicEvents()).length, 18);
  stubFetch(() => json({}));
  assertEquals((await seedEconomicEvents()).length, 18);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  assertEquals((await seedEconomicEvents()).length, 18);
});
