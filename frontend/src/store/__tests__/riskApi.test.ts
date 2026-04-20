import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { riskApi } from "../riskApi";

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
      [riskApi.reducerPath]: riskApi.reducer,
    },
    middleware: (gdm) => gdm().concat(riskApi.middleware),
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

describe("riskApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls risk endpoints with expected urls and verbs", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: methodOf(input, init) });
      return new Response(JSON.stringify({ ok: true, positions: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const store = createStore();

    await store.dispatch(riskApi.endpoints.getPositions.initiate(undefined));
    await store.dispatch(riskApi.endpoints.getUserPositions.initiate("user/1"));
    await store.dispatch(riskApi.endpoints.getRiskConfig.initiate(undefined));
    await store.dispatch(riskApi.endpoints.updateRiskConfig.initiate({ maxOpenOrders: 20 }));
    await store.dispatch(riskApi.endpoints.getBreakers.initiate(undefined));

    expect(calls.some((c) => c.url.endsWith("/positions") && c.method === "GET")).toBe(true);
    expect(calls.some((c) => c.url.includes("/positions/user%2F1") && c.method === "GET")).toBe(
      true
    );
    expect(calls.some((c) => c.url.endsWith("/config") && c.method === "GET")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/config") && c.method === "PUT")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/breakers") && c.method === "GET")).toBe(true);
  });
});
