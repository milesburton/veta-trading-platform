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
  features: { value: null as unknown },
  weights: { value: null as unknown, fail: false },
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveJsonService: (config: ServiceConfig) => {
    h.config = config;
  },
}));
vi.mock("../shared/idle-exit.ts", () => ({ armIdleExit: () => ({ touch: h.touch }) }));

const FEATURES = {
  symbol: "AAPL",
  ts: 1,
  momentum: 0.2,
  relativeVolume: 1.5,
  realisedVol: 0.3,
  sectorRelativeStrength: 0.1,
  eventScore: 0,
  newsVelocity: 0,
  sentimentDelta: 0,
};

async function call(method: string, path: string, body?: unknown) {
  assert(h.config);
  const url = new URL(`http://sc${path}`);
  const req = new Request(url, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return h.config.handler(req, url, url.pathname);
}

beforeAll(async () => {
  await import("../scenario-engine/scenario-server.ts");
});

afterEach(() => {
  h.features.value = FEATURES;
  h.weights.value = null;
  h.weights.fail = false;
  vi.unstubAllGlobals();
});

function stubUpstreams() {
  vi.stubGlobal("fetch", (input: string) => {
    const url = String(input);
    if (url.includes("/features/")) {
      return h.features.value
        ? Promise.resolve(new Response(JSON.stringify(h.features.value)))
        : Promise.resolve(new Response("{}", { status: 404 }));
    }
    if (url.endsWith("/weights")) {
      if (h.weights.fail) return Promise.reject(new Error("down"));
      return h.weights.value
        ? Promise.resolve(new Response(JSON.stringify(h.weights.value)))
        : Promise.resolve(new Response("{}", { status: 500 }));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  });
}

const SHOCK = { type: "volatility", magnitude: 2 };

test("[scenario-server] registers the service with an idle touch hook", () => {
  assert(h.config);
  assertEquals(h.config.health(), {});
  h.config.onRequest?.();
  assertEquals(h.touch.mock.calls.length, 1);
});

test("[scenario-server] scores a baseline and a shocked signal with default weights", async () => {
  h.features.value = FEATURES;
  stubUpstreams();
  const res = await call("POST", "/scenario", { symbol: "AAPL", shocks: [SHOCK] });
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.symbol, "AAPL");
  assertEquals(body.shocksApplied, [SHOCK]);
  assertEquals(body.delta, body.shocked.score - body.baseline.score);
});

test("[scenario-server] uses the signal engine's live weights when available", async () => {
  h.features.value = FEATURES;
  h.weights.value = {
    momentum: 5,
    relativeVolume: 0,
    realisedVol: 0,
    sectorRelativeStrength: 0,
    eventScore: 0,
    newsVelocity: 0,
    sentimentDelta: 0,
  };
  stubUpstreams();
  const weighted = await (await call("POST", "/scenario", { symbol: "AAPL", shocks: [] })).json();

  h.weights.value = null;
  const defaults = await (await call("POST", "/scenario", { symbol: "AAPL", shocks: [] })).json();
  assert(weighted.baseline.score !== defaults.baseline.score);
});

test("[scenario-server] falls back to default weights when the signal engine is down", async () => {
  h.features.value = FEATURES;
  h.weights.fail = true;
  stubUpstreams();
  assertEquals((await call("POST", "/scenario", { symbol: "AAPL", shocks: [] })).status, 200);
});

test("[scenario-server] validates the request and the feature data", async () => {
  stubUpstreams();
  assertEquals((await call("POST", "/scenario", "{bad")).status, 400);
  assertEquals((await call("POST", "/scenario", { symbol: "AAPL" })).status, 400);
  assertEquals((await call("POST", "/scenario", { shocks: [] })).status, 400);

  h.features.value = null;
  assertEquals((await call("POST", "/scenario", { symbol: "ZZZ", shocks: [] })).status, 503);

  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  assertEquals((await call("POST", "/scenario", { symbol: "ZZZ", shocks: [] })).status, 503);
});

test("[scenario-server] rejects other routes", async () => {
  assertEquals((await call("GET", "/scenario")).status, 404);
  assertEquals((await call("GET", "/other")).status, 404);
});
