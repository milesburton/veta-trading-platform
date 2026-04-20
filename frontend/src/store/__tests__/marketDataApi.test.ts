import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketDataApi } from "../marketDataApi";

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
      [marketDataApi.reducerPath]: marketDataApi.reducer,
    },
    middleware: (gdm) => gdm().concat(marketDataApi.middleware),
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

describe("marketDataApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls market-data endpoints with expected urls and verbs", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: methodOf(input, init) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const store = createStore();

    await store.dispatch(marketDataApi.endpoints.getSources.initiate());
    await store.dispatch(marketDataApi.endpoints.getOverrides.initiate());
    await store.dispatch(
      marketDataApi.endpoints.setOverrides.initiate({
        AAPL: "IEX",
      })
    );
    await store.dispatch(marketDataApi.endpoints.toggleFeed.initiate("feed-1"));

    expect(calls.some((c) => c.url.includes("/market-data/sources") && c.method === "GET")).toBe(
      true
    );
    expect(calls.some((c) => c.url.includes("/market-data/overrides") && c.method === "GET")).toBe(
      true
    );
    expect(calls.some((c) => c.url.includes("/market-data/overrides") && c.method === "PUT")).toBe(
      true
    );
    expect(
      calls.some((c) => c.url.includes("/market-data/sources/feed-1/toggle") && c.method === "POST")
    ).toBe(true);
  });
});
