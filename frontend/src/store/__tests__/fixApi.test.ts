import { configureStore } from "@reduxjs/toolkit";
import { fixApi } from "@veta/frontend/store/fixApi.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

function makeStore() {
  return configureStore({
    reducer: { [fixApi.reducerPath]: fixApi.reducer },
    middleware: (gdm) => gdm().concat(fixApi.middleware),
  });
}

describe("fixApi getFixExecutions", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an empty list when the API answers with null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("null", { status: 200, headers: { "content-type": "application/json" } })
    );
    const store = makeStore();

    const result = await store.dispatch(fixApi.endpoints.getFixExecutions.initiate({ limit: 5 }));

    expect(result.data).toEqual([]);
  });

  it("passes an array through unchanged", async () => {
    const rows = [{ orderId: "o-1", symbol: "AAPL" }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const store = makeStore();

    const result = await store.dispatch(fixApi.endpoints.getFixExecutions.initiate({ limit: 5 }));

    expect(result.data).toEqual(rows);
  });
});
