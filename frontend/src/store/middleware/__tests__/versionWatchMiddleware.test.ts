import { configureStore } from "@reduxjs/toolkit";
import { authSlice, setUser } from "@veta/frontend/store/authSlice";
import { versionWatchMiddleware } from "@veta/frontend/store/middleware/versionWatchMiddleware";
import { uiSlice } from "@veta/frontend/store/uiSlice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeStore() {
  const store = configureStore({
    reducer: {
      auth: authSlice.reducer,
      ui: uiSlice.reducer,
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(versionWatchMiddleware),
  });
  return store;
}

let fetchMock: ReturnType<typeof vi.fn>;
let reloadMock: ReturnType<typeof vi.fn>;
const originalLocation = globalThis.location;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  reloadMock = vi.fn();
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...originalLocation, reload: reloadMock },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("versionWatchMiddleware", () => {
  it("captures the baseline hash on first poll without firing the banner", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ hash: "abc123" }), { status: 200 }));
    const store = makeStore();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    expect(store.getState().ui.updateAvailable).toBe(false);
  });

  it("sets updateAvailable when the hash changes for authenticated users", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "abc" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "def" }), { status: 200 }));
    const store = makeStore();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    store.dispatch(setUser({ id: "alice", name: "Alice", role: "trader", avatar_emoji: "👩" }));
    await vi.advanceTimersByTimeAsync(15_000);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(store.getState().ui.updateAvailable).toBe(true);
  });

  it("auto-reloads anonymous users when the hash changes", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "abc" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "def" }), { status: 200 }));
    makeStore();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-reload authenticated users on hash change", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "abc" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "def" }), { status: 200 }));
    const store = makeStore();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    store.dispatch(setUser({ id: "alice", name: "Alice", role: "trader", avatar_emoji: "👩" }));
    await vi.advanceTimersByTimeAsync(15_000);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("auto-reloads anonymous users after sustained __version failures", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    makeStore();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      for (let j = 0; j < 5; j++) await Promise.resolve();
    }
    expect(reloadMock).toHaveBeenCalled();
  });

  it("does not auto-reload authenticated users on sustained failures (would lose work)", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const store = makeStore();
    store.dispatch(setUser({ id: "alice", name: "Alice", role: "trader", avatar_emoji: "👩" }));
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      for (let j = 0; j < 5; j++) await Promise.resolve();
    }
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("resets the failure counter on a successful poll", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hash: "abc" }), { status: 200 }))
      .mockResolvedValue(new Response("", { status: 404 }));
    makeStore();
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      for (let j = 0; j < 5; j++) await Promise.resolve();
    }
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
