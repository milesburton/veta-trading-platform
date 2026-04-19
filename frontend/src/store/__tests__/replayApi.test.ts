import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replayApi } from "../replayApi";

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
      [replayApi.reducerPath]: replayApi.reducer,
    },
    middleware: (gdm) => gdm().concat(replayApi.middleware),
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

describe("replayApi", () => {
  beforeEach(() => {
    installRelativeRequestSupport();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls replay endpoints with expected routing and verbs", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: urlOf(input), method: methodOf(input, init) });
      return new Response(
        JSON.stringify({ ok: true, sessions: [], total: 0, events: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const store = createStore();

    await store.dispatch(replayApi.endpoints.getReplayConfig.initiate());
    await store.dispatch(
      replayApi.endpoints.updateReplayConfig.initiate({
        enabled: true,
        userId: "u1",
      }),
    );
    await store.dispatch(
      replayApi.endpoints.listSessions.initiate({ limit: 10, offset: 20 }),
    );
    await store.dispatch(
      replayApi.endpoints.createSession.initiate({ id: "s1", userId: "u1" }),
    );
    await store.dispatch(replayApi.endpoints.endSession.initiate("s1"));
    await store.dispatch(
      replayApi.endpoints.uploadChunk.initiate({
        sessionId: "s1",
        seq: 1,
        events: [{ a: 1 }],
      }),
    );
    await store.dispatch(replayApi.endpoints.getSessionEvents.initiate("s1"));
    await store.dispatch(replayApi.endpoints.deleteSession.initiate("s1"));

    expect(
      calls.some((c) => c.url.endsWith("/config") && c.method === "GET"),
    ).toBe(true);
    expect(
      calls.some((c) => c.url.endsWith("/config") && c.method === "PUT"),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.url.includes("/sessions?limit=10&offset=20") && c.method === "GET",
      ),
    ).toBe(true);
    expect(
      calls.some((c) => c.url.endsWith("/sessions") && c.method === "POST"),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.url.endsWith("/sessions/s1/end") && c.method === "PUT",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.url.endsWith("/sessions/s1/chunks") && c.method === "POST",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.url.endsWith("/sessions/s1/events") && c.method === "GET",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.url.endsWith("/sessions/s1") && c.method === "DELETE",
      ),
    ).toBe(true);
  });
});
