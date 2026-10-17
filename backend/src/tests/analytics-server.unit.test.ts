import { afterEach, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

interface ServiceConfig {
  health: () => Record<string, unknown>;
  onRequest?: () => void;
  handler: (req: Request, url: URL, path: string) => Response | Promise<Response>;
}

const h = vi.hoisted(() => ({
  config: undefined as undefined | ServiceConfig,
  touch: vi.fn(),
  spot: { value: 200 as number | null },
  vol: { value: 0.3 },
  profile: { value: null as unknown },
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveJsonService: (config: ServiceConfig) => {
    h.config = config;
  },
}));
vi.mock("../shared/idle-exit.ts", () => ({ armIdleExit: () => ({ touch: h.touch }) }));
vi.mock("../analytics/volatility-estimator.ts", () => ({
  fetchSpotPrice: () => Promise.resolve(h.spot.value),
  estimateVol: () => Promise.resolve(h.vol.value),
  estimateVolProfile: () => Promise.resolve(h.profile.value),
}));

async function call(method: string, path: string, body?: unknown) {
  assert(h.config);
  const url = new URL(`http://an${path}`);
  const req = new Request(url, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return h.config.handler(req, url, url.pathname);
}

beforeAll(async () => {
  await import("../analytics/analytics-server.ts");
});

afterEach(() => {
  h.spot.value = 200;
  h.profile.value = null;
  vi.unstubAllGlobals();
});

const OPTION = { symbol: "AAPL", optionType: "call", strike: 200, expirySecs: 30 * 86_400 };

test("[analytics] registers the service with an idle touch hook", () => {
  assert(h.config);
  assertEquals(h.config.health(), {});
  h.config.onRequest?.();
  assertEquals(h.touch.mock.calls.length, 1);
});

test("[analytics] quotes an option with Black-Scholes price and greeks", async () => {
  const res = await call("POST", "/quote", OPTION);
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.spotPrice, 200);
  assertEquals(body.impliedVol, 0.3);
  assert(body.price > 0);
  assert(body.greeks.delta > 0 && body.greeks.delta < 1);
});

test("[analytics] quote validates the body and the spot price", async () => {
  assertEquals((await call("POST", "/quote", "{bad")).status, 400);
  assertEquals((await call("POST", "/quote", { symbol: "AAPL" })).status, 400);
  h.spot.value = null;
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
  assertEquals((await call("POST", "/quote", OPTION)).status, 404);
});

test("[analytics] falls back to market-sim prices and caches them", async () => {
  h.spot.value = null;
  const fetcher = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify([{ symbol: "MSFT", initialPrice: 410 }])))
  );
  vi.stubGlobal("fetch", fetcher);
  const first = await (await call("POST", "/quote", { ...OPTION, symbol: "MSFT" })).json();
  assertEquals(first.spotPrice, 410);
  const second = await (await call("POST", "/quote", { ...OPTION, symbol: "MSFT" })).json();
  assertEquals(second.spotPrice, 410);
  assertEquals(fetcher.mock.calls.length, 1);

  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  assertEquals((await call("POST", "/quote", { ...OPTION, symbol: "ZZZ" })).status, 404);
});

test("[analytics] builds a scenario matrix with Monte Carlo statistics", async () => {
  const res = await call("POST", "/scenario", {
    ...OPTION,
    spotShocks: [-0.1, 0, 0.1],
    volShocks: [-0.05, 0.05],
    timeDays: 5,
    paths: 200,
  });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.cells.length, 3);
  assertEquals(body.cells[0].length, 2);
  assert(body.cells[0][0].pnl < body.cells[2][0].pnl);
  assert("optionPrice" in body.cells[1][1]);
});

test("[analytics] scenario validates its inputs", async () => {
  assertEquals((await call("POST", "/scenario", "{bad")).status, 400);
  assertEquals((await call("POST", "/scenario", { ...OPTION, spotShocks: [] })).status, 400);
  h.spot.value = null;
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  const missingSpot = await call("POST", "/scenario", {
    ...OPTION,
    symbol: "NOPE",
    spotShocks: [0],
    volShocks: [0],
  });
  assertEquals(missingSpot.status, 404);
});

test("[analytics] recommends options with and without a signal", async () => {
  const plain = await (
    await call("POST", "/recommend", { symbol: "AAPL", strikes: [190, 200], expiries: [86_400] })
  ).json();
  assertEquals(plain.recommendations.length, 4);
  assert(plain.recommendations[0].score >= plain.recommendations[3].score);

  const defaults = await (await call("POST", "/recommend", { symbol: "AAPL" })).json();
  assert(defaults.recommendations.length > 4);

  const signalled = await call("POST", "/recommend", {
    symbol: "AAPL",
    strikes: [200],
    expiries: [86_400],
    signal: { symbol: "AAPL", score: 0.9, direction: "BUY", confidence: 0.9, factors: [], ts: 1 },
  });
  assertEquals(signalled.status, 200);
});

test("[analytics] recommend validates its inputs", async () => {
  assertEquals((await call("POST", "/recommend", "{bad")).status, 400);
  assertEquals((await call("POST", "/recommend", {})).status, 400);
  h.spot.value = null;
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  assertEquals((await call("POST", "/recommend", { symbol: "NOPE" })).status, 404);
});

test("[analytics] serves the volatility profile or explains why it cannot", async () => {
  assertEquals((await call("GET", "/vol-profile/AAPL")).status, 404);
  assertEquals((await call("GET", "/vol-profile/")).status, 400);

  h.profile.value = { ewmaVol: 0.25, rollingVol: 0.27, ewmaSeries: [{ ts: 1, vol: 0.25 }] };
  const body = await (await call("GET", "/vol-profile/AAPL")).json();
  assertEquals(body.ewmaVol, 0.25);
  assertEquals(body.series.length, 1);
  assertEquals(body.spotPrice, 200);
});

test("[analytics] serves a greeks surface across strikes", async () => {
  const body = await (await call("GET", "/greeks-surface/AAPL?expirySecs=86400")).json();
  assertEquals(body.strikes.length, 25);
  assertEquals(body.expirySecs, 86_400);
  assert(body.strikes[0].callDelta > body.strikes[24].callDelta);

  const defaulted = await (await call("GET", "/greeks-surface/AAPL")).json();
  assertEquals(defaulted.expirySecs, 30 * 86_400);

  assertEquals((await call("GET", "/greeks-surface/")).status, 400);
  h.spot.value = null;
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  assertEquals((await call("GET", "/greeks-surface/NOPE")).status, 404);
});

test("[analytics] prices bonds and validates the request", async () => {
  const body = await (
    await call("POST", "/bond-price", { couponRate: 0.05, totalPeriods: 20, yieldAnnual: 0.05 })
  ).json();
  assert(body.price > 0);
  assertEquals((await call("POST", "/bond-price", "{bad")).status, 400);
  assertEquals((await call("POST", "/bond-price", { couponRate: 0.05 })).status, 400);
});

test("[analytics] builds a yield curve with or without a body", async () => {
  const withParams = await call("POST", "/yield-curve", { params: { beta0: 0.04 } });
  assertEquals(withParams.status, 200);
  const empty = await call("POST", "/yield-curve", "");
  assertEquals(empty.status, 200);
});

test("[analytics] serves a price fan with bounded parameters", async () => {
  const body = await (
    await call("GET", "/price-fan/AAPL?steps=5&stepSecs=3600&paths=100&riskFreeRate=0.03")
  ).json();
  assertEquals(body.steps.length, 5);
  assertEquals(body.riskFreeRate, 0.03);

  const clamped = await (await call("GET", "/price-fan/AAPL?steps=9999&paths=1")).json();
  assertEquals(clamped.steps.length, 200);

  assertEquals((await call("GET", "/price-fan/")).status, 400);
  h.spot.value = null;
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  assertEquals((await call("GET", "/price-fan/NOPE")).status, 404);
});

test("[analytics] analyses spreads against the curve", async () => {
  const ok = await call("POST", "/spread-analysis", {
    couponRate: 0.05,
    totalPeriods: 20,
    yieldAnnual: 0.055,
  });
  const body = await ok.json();
  assertEquals(ok.status, 200);
  assertEquals(body.bondYield, 0.055);
  assertEquals((await call("POST", "/spread-analysis", "{bad")).status, 400);
  assertEquals((await call("POST", "/spread-analysis", { couponRate: 0.05 })).status, 400);
});

test("[analytics] builds a duration ladder for a portfolio", async () => {
  const ok = await call("POST", "/duration-ladder", {
    positions: [
      { faceValue: 1000, couponRate: 0.05, totalPeriods: 20, yieldAnnual: 0.05, quantity: 10 },
    ],
  });
  assertEquals(ok.status, 200);
  assertEquals((await call("POST", "/duration-ladder", "{bad")).status, 400);
  assertEquals((await call("POST", "/duration-ladder", { positions: [] })).status, 400);
});

test("[analytics] serves a volatility surface and rejects unknown routes", async () => {
  const body = await (await call("GET", "/vol-surface/AAPL")).json();
  assertEquals(body.symbol, "AAPL");
  assertEquals((await call("GET", "/vol-surface/")).status, 400);
  h.spot.value = null;
  vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
  assertEquals((await call("GET", "/vol-surface/NOPE")).status, 404);
  assertEquals((await call("GET", "/unknown")).status, 404);
});
