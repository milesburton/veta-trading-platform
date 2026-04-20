/**
 * Integration test: verifying the Redux store is assembled correctly.
 *
 * Importing store/index instantiates the real store with all reducers,
 * middleware, and RTK Query APIs registered. These tests ensure the
 * full store graph compiles and the initial state shape is correct.
 */
import { describe, expect, it, vi, afterEach } from "vitest";

// versionWatchMiddleware starts polling on init — stub fetch to avoid noise
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

import { store } from "../index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("store – initial state shape", () => {
  it("has all top-level state slices present", () => {
    const state = store.getState();
    expect(state.auth).toBeDefined();
    expect(state.orders).toBeDefined();
    expect(state.market).toBeDefined();
    expect(state.news).toBeDefined();
    expect(state.ui).toBeDefined();
    expect(state.killSwitch).toBeDefined();
    expect(state.alerts).toBeDefined();
    expect(state.gridPrefs).toBeDefined();
    expect(state.theme).toBeDefined();
    expect(state.intelligence).toBeDefined();
    expect(state.advisory).toBeDefined();
    expect(state.llmSubsystem).toBeDefined();
    expect(state.breakers).toBeDefined();
    expect(state.feed).toBeDefined();
    expect(state.windows).toBeDefined();
    expect(state.channels).toBeDefined();
    expect(state.observability).toBeDefined();
  });

  it("RTK Query API reducers are present", () => {
    const state = store.getState();
    expect(state.servicesApi).toBeDefined();
    expect(state.analyticsApi).toBeDefined();
    expect(state.gatewayApi).toBeDefined();
    expect(state.gridApi).toBeDefined();
    expect(state.newsApi).toBeDefined();
    expect(state.riskApi).toBeDefined();
    expect(state.userApi).toBeDefined();
  });

  it("dispatching an unknown action does not throw", () => {
    expect(() => store.dispatch({ type: "unknown/action" })).not.toThrow();
  });
});
