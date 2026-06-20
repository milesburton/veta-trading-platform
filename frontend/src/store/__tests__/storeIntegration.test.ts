import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

import { hydrateFromSnapshot, store } from "@veta/frontend/store/index";

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

describe("store – hydrateFromSnapshot", () => {
  it("merges a snapshot's auth slice so a pop-out sees the signed-in trader", () => {
    expect(store.getState().auth.user).toBeNull();

    store.dispatch(
      hydrateFromSnapshot({
        auth: {
          user: { id: "rajesh", name: "Rajesh Patel", role: "trader", avatar_emoji: "🧑" },
          limits: {
            max_order_qty: 10_000,
            max_daily_notional: 1_000_000,
            allowed_strategies: ["LIMIT"],
            allowed_desks: ["equity"],
            dark_pool_access: false,
            trading_style: "high_touch",
          },
          status: "authenticated",
          sessionExpired: false,
        },
      })
    );

    const auth = store.getState().auth;
    expect(auth.user?.role).toBe("trader");
    expect(auth.user?.name).toBe("Rajesh Patel");
    expect(auth.status).toBe("authenticated");
  });

  it("leaves slices absent from the snapshot untouched", () => {
    const marketBefore = store.getState().market;
    store.dispatch(hydrateFromSnapshot({ ui: { ...store.getState().ui, selectedAsset: "AAPL" } }));
    expect(store.getState().ui.selectedAsset).toBe("AAPL");
    expect(store.getState().market).toBe(marketBefore);
  });
});
