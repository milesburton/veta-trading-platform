import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newsApi } from "../newsApi";

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
      [newsApi.reducerPath]: newsApi.reducer,
    },
    middleware: (gdm) => gdm().concat(newsApi.middleware),
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

describe("newsApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls news endpoints with expected urls and verbs", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: methodOf(input, init) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const store = createStore();

    await store.dispatch(newsApi.endpoints.getNewsBySymbol.initiate({ symbol: "AAPL/USD", limit: 25 }));
    await store.dispatch(newsApi.endpoints.getNewsSources.initiate());
    await store.dispatch(newsApi.endpoints.toggleNewsSource.initiate("src/1"));
    await store.dispatch(
      newsApi.endpoints.createNewsSource.initiate({
        label: "Desk feed",
        rssTemplate: "https://feed.example/{symbol}",
        symbolSpecific: true,
        enabled: true,
      })
    );
    await store.dispatch(
      newsApi.endpoints.updateNewsSource.initiate({
        id: "src/1",
        label: "Desk feed 2",
        enabled: false,
      })
    );
    await store.dispatch(newsApi.endpoints.deleteNewsSource.initiate("src/1"));

    expect(
      calls.some(
        (c) => c.url.includes("/news?symbol=AAPL%2FUSD&limit=25") && c.method === "GET"
      )
    ).toBe(true);
    expect(calls.some((c) => c.url.includes("/sources") && c.method === "GET")).toBe(true);
    expect(calls.some((c) => c.url.includes("/sources/src%2F1/toggle") && c.method === "POST")).toBe(
      true
    );
    expect(
      calls.some((c) => c.url.match(/\/sources$/) && c.method === "POST")
    ).toBe(true);
    expect(calls.some((c) => c.url.includes("/sources/src%2F1") && c.method === "PUT")).toBe(true);
    expect(calls.some((c) => c.url.includes("/sources/src%2F1") && c.method === "DELETE")).toBe(
      true
    );
  });
});
