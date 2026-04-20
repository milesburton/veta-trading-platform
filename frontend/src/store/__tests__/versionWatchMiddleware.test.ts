import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { versionWatchMiddleware } from "../middleware/versionWatchMiddleware";
import { setUpdateAvailable } from "../uiSlice";

/** Build a minimal store harness and run the middleware initialisation */
function createHarness() {
  const dispatched: unknown[] = [];
  const storeAPI = {
    dispatch: (action: unknown) => {
      dispatched.push(action);
      return action;
    },
    getState: () => ({}),
  };
  const next = vi.fn((action: unknown) => action);
  const invoke = versionWatchMiddleware(storeAPI as never)(next);
  return { dispatched, next, invoke, storeAPI };
}

// Minimal fulfilled action shape that matches servicesApi.endpoints.getServiceHealth.matchFulfilled
function makeHealthFulfilled(name: string, version: string, state = "ok") {
  return {
    type: "servicesApi/executeQuery/fulfilled",
    payload: { name, version, state },
    meta: {
      arg: { endpointName: "getServiceHealth" },
      requestStatus: "fulfilled",
    },
  };
}

describe("versionWatchMiddleware – frontend version polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches frontend version on init and stores the baseline hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: "abc123" }),
      })
    );
    createHarness();
    // Flush only the initial eager call (no timer advance needed)
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/__version", {
      cache: "no-store",
    });
  });

  it("dispatches setUpdateAvailable when frontend hash changes", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++;
        const hash = callCount === 1 ? "hash-v1" : "hash-v2";
        return { ok: true, json: async () => ({ hash }) };
      })
    );

    const { dispatched } = createHarness();
    // Flush the initial eager call
    await vi.advanceTimersByTimeAsync(0);
    // Advance exactly one poll interval to trigger the second call
    await vi.advanceTimersByTimeAsync(30_000);

    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(true);
  });

  it("does NOT dispatch update when hash is unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ hash: "stable-hash" }),
      })
    );

    const { dispatched } = createHarness();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });

  it("handles fetch errors gracefully without dispatching", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const { dispatched } = createHarness();
    await vi.advanceTimersByTimeAsync(0);

    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });

  it("handles non-ok responses gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const { dispatched } = createHarness();
    await vi.advanceTimersByTimeAsync(0);

    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });
});

describe("versionWatchMiddleware – backend service version tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("passes unrelated actions to next unchanged", () => {
    const { next, invoke } = createHarness();
    const action = { type: "some/other" };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
  });

  it("records backend baseline on first getServiceHealth fulfilled", () => {
    const { dispatched, invoke } = createHarness();
    invoke(makeHealthFulfilled("EMS", "1.2.3"));
    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });

  it("dispatches setUpdateAvailable when backend service version changes", () => {
    const { dispatched, invoke } = createHarness();
    // First call establishes baseline
    invoke(makeHealthFulfilled("EMS", "1.2.3"));
    // Second call with different version triggers update notice
    invoke(makeHealthFulfilled("EMS", "1.3.0"));
    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(true);
  });

  it("does NOT dispatch when backend version is the same", () => {
    const { dispatched, invoke } = createHarness();
    invoke(makeHealthFulfilled("EMS", "1.2.3"));
    invoke(makeHealthFulfilled("EMS", "1.2.3"));
    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });

  it("ignores services in non-ok state", () => {
    const { dispatched, invoke } = createHarness();
    invoke(makeHealthFulfilled("EMS", "1.2.3", "error"));
    invoke(makeHealthFulfilled("EMS", "1.3.0", "error"));
    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });

  it("ignores dev/placeholder versions", () => {
    const { dispatched, invoke } = createHarness();
    invoke(makeHealthFulfilled("EMS", "dev"));
    invoke(makeHealthFulfilled("EMS", "—"));
    expect(dispatched.some((a) => setUpdateAvailable.match(a as { type: string }))).toBe(false);
  });
});
