import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advisoryApi } from "../advisoryApi";

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
    },
  );
}

function createStore() {
  return configureStore({
    reducer: {
      [advisoryApi.reducerPath]: advisoryApi.reducer,
    },
    middleware: (gdm) => gdm().concat(advisoryApi.middleware),
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

describe("advisoryApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls advisory endpoints with expected urls and verbs", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: methodOf(input, init) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const store = createStore();

    await store.dispatch(advisoryApi.endpoints.getAdvisory.initiate("AAPL/US"));
    await store.dispatch(
      advisoryApi.endpoints.requestAdvisory.initiate({ symbol: "AAPL" }),
    );
    await store.dispatch(advisoryApi.endpoints.getLlmSubsystemState.initiate());
    await store.dispatch(
      advisoryApi.endpoints.updateLlmSubsystemState.initiate({
        enabled: true,
        triggerMode: "manual",
      }),
    );
    await store.dispatch(
      advisoryApi.endpoints.requestWatchlistBrief.initiate({ symbols: ["AAPL", "MSFT"] }),
    );
    await store.dispatch(advisoryApi.endpoints.triggerWorker.initiate());

    expect(
      calls.some((c) => c.url.includes("/advisory/AAPL%2FUS") && c.method === "GET"),
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/advisory/request") && c.method === "POST"),
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/advisory/admin/state") && c.method === "GET"),
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/advisory/admin/state") && c.method === "PUT"),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.url.includes("/advisory/admin/watchlist-brief") && c.method === "POST",
      ),
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes("/advisory/admin/trigger-worker") && c.method === "POST"),
    ).toBe(true);
  });
});
