import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsApi } from "../analyticsApi";

const NativeRequest = Request;

function installRelativeRequestSupport() {
  vi.stubGlobal(
    "Request",
    class RequestWithBase extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        if (typeof input === "string" && input.startsWith("/")) {
          super(`http://localhost${input}`, init);
          return;
        }
        super(input, init);
      }
    }
  );
}

function createStore() {
  return configureStore({
    reducer: {
      [analyticsApi.reducerPath]: analyticsApi.reducer,
    },
    middleware: (gdm) => gdm().concat(analyticsApi.middleware),
  });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  if (typeof input === "string" || input instanceof URL) return "GET";
  return input.method;
}

describe("analyticsApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hits expected analytics endpoints with correct verbs and params", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({
        url: urlOf(input),
        method: methodOf(input, init),
      });
      return new Response(JSON.stringify({ ok: true, rows: [], total: 0, evalMs: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const store = createStore();

    await store.dispatch(analyticsApi.endpoints.getQuote.initiate({ symbol: "AAPL" } as never));
    await store.dispatch(analyticsApi.endpoints.getScenario.initiate({ symbol: "AAPL" } as never));
    await store.dispatch(
      analyticsApi.endpoints.getRecommendations.initiate({
        symbol: "AAPL",
      } as never)
    );
    await store.dispatch(
      analyticsApi.endpoints.getGreeksSurface.initiate({
        symbol: "AAPL",
        expirySecs: 120,
      })
    );
    await store.dispatch(analyticsApi.endpoints.getVolProfile.initiate("AAPL"));
    await store.dispatch(analyticsApi.endpoints.getBondPrice.initiate({ isin: "X" } as never));
    await store.dispatch(analyticsApi.endpoints.getYieldCurve.initiate({} as never));
    await store.dispatch(
      analyticsApi.endpoints.getPriceFan.initiate({
        symbol: "AAPL",
        steps: 12,
        stepSecs: 60,
        paths: 100,
      })
    );
    await store.dispatch(analyticsApi.endpoints.getSpreadAnalysis.initiate({} as never));
    await store.dispatch(analyticsApi.endpoints.getDurationLadder.initiate({ positions: [] }));
    await store.dispatch(analyticsApi.endpoints.getVolSurface.initiate("AAPL"));

    expect(calls.some((c) => c.url.includes("/analytics/quote") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.includes("/analytics/scenario") && c.method === "POST")).toBe(
      true
    );
    expect(calls.some((c) => c.url.includes("/analytics/recommend") && c.method === "POST")).toBe(
      true
    );
    expect(
      calls.some(
        (c) => c.url.includes("/analytics/greeks-surface/AAPL?expirySecs=120") && c.method === "GET"
      )
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/analytics/vol-profile/AAPL") && c.method === "GET")
    ).toBe(true);
    expect(calls.some((c) => c.url.includes("/analytics/bond-price") && c.method === "POST")).toBe(
      true
    );
    expect(calls.some((c) => c.url.includes("/analytics/yield-curve") && c.method === "POST")).toBe(
      true
    );
    expect(
      calls.some(
        (c) =>
          c.url.includes("/analytics/price-fan/AAPL?steps=12&stepSecs=60&paths=100") &&
          c.method === "GET"
      )
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/analytics/spread-analysis") && c.method === "POST")
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/analytics/duration-ladder") && c.method === "POST")
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/analytics/vol-surface/AAPL") && c.method === "GET")
    ).toBe(true);
  });
});
