import {
  hideShortcuts,
  loadUiPrefs,
  saveUiPrefs,
  setActiveSide,
  setActiveStrategy,
  setAlgoMonitorTab,
  setObservabilityTab,
  setOrderTicketWindowSize,
  setSelectedAsset,
  setShowHeartbeats,
  setShowOverridesOnly,
  toggleShortcuts,
  uiSlice,
} from "@veta/frontend/store/uiSlice";
import { describe, expect, it, vi } from "vitest";

const { reducer } = uiSlice;
const initial = reducer(undefined, { type: "@@init" });

describe("uiSlice – initial state", () => {
  it("has TWAP as default strategy", () => {
    expect(initial.activeStrategy).toBe("TWAP");
  });

  it("has BUY as default side", () => {
    expect(initial.activeSide).toBe("BUY");
  });

  it("has showShortcuts false by default", () => {
    expect(initial.showShortcuts).toBe(false);
  });

  it("has selectedAsset null by default", () => {
    expect(initial.selectedAsset).toBeNull();
  });

  it("has algoMonitorTab 'active' by default", () => {
    expect(initial.algoMonitorTab).toBe("active");
  });

  it("has showHeartbeats false by default", () => {
    expect(initial.showHeartbeats).toBe(false);
  });

  it("has observabilityTab 'summary' by default", () => {
    expect(initial.observabilityTab).toBe("summary");
  });

  it("has showOverridesOnly false by default", () => {
    expect(initial.showOverridesOnly).toBe(false);
  });
});

describe("uiSlice – setActiveStrategy", () => {
  it("sets strategy to TWAP", () => {
    const state = reducer(initial, setActiveStrategy("TWAP"));
    expect(state.activeStrategy).toBe("TWAP");
  });

  it("sets strategy to POV", () => {
    const state = reducer(initial, setActiveStrategy("POV"));
    expect(state.activeStrategy).toBe("POV");
  });

  it("sets strategy to VWAP", () => {
    const state = reducer(initial, setActiveStrategy("VWAP"));
    expect(state.activeStrategy).toBe("VWAP");
  });

  it("sets strategy back to LIMIT", () => {
    let state = reducer(initial, setActiveStrategy("TWAP"));
    state = reducer(state, setActiveStrategy("LIMIT"));
    expect(state.activeStrategy).toBe("LIMIT");
  });
});

describe("uiSlice – setActiveSide", () => {
  it("sets side to SELL", () => {
    const state = reducer(initial, setActiveSide("SELL"));
    expect(state.activeSide).toBe("SELL");
  });

  it("sets side back to BUY", () => {
    let state = reducer(initial, setActiveSide("SELL"));
    state = reducer(state, setActiveSide("BUY"));
    expect(state.activeSide).toBe("BUY");
  });
});

describe("uiSlice – toggleShortcuts", () => {
  it("toggles from false to true", () => {
    const state = reducer(initial, toggleShortcuts());
    expect(state.showShortcuts).toBe(true);
  });

  it("toggles from true back to false", () => {
    let state = reducer(initial, toggleShortcuts());
    state = reducer(state, toggleShortcuts());
    expect(state.showShortcuts).toBe(false);
  });
});

describe("uiSlice – hideShortcuts", () => {
  it("sets showShortcuts to false when already false", () => {
    const state = reducer(initial, hideShortcuts());
    expect(state.showShortcuts).toBe(false);
  });

  it("sets showShortcuts to false when true", () => {
    let state = reducer(initial, toggleShortcuts());
    expect(state.showShortcuts).toBe(true);
    state = reducer(state, hideShortcuts());
    expect(state.showShortcuts).toBe(false);
  });
});

describe("uiSlice – setSelectedAsset", () => {
  it("sets selected asset symbol", () => {
    const state = reducer(initial, setSelectedAsset("MSFT"));
    expect(state.selectedAsset).toBe("MSFT");
  });

  it("clears selected asset to null", () => {
    let state = reducer(initial, setSelectedAsset("AAPL"));
    state = reducer(state, setSelectedAsset(null));
    expect(state.selectedAsset).toBeNull();
  });
});

describe("uiSlice – orderTicketWindowSize", () => {
  it("defaults to 480×780", () => {
    expect(initial.orderTicketWindowSize).toEqual({ w: 480, h: 780 });
  });

  it("setOrderTicketWindowSize updates dimensions", () => {
    const state = reducer(initial, setOrderTicketWindowSize({ w: 600, h: 900 }));
    expect(state.orderTicketWindowSize).toEqual({ w: 600, h: 900 });
  });
});

describe("uiSlice – setAlgoMonitorTab", () => {
  it("sets tab to needs-action", () => {
    const state = reducer(initial, setAlgoMonitorTab("needs-action"));
    expect(state.algoMonitorTab).toBe("needs-action");
  });

  it("sets tab to history", () => {
    const state = reducer(initial, setAlgoMonitorTab("history"));
    expect(state.algoMonitorTab).toBe("history");
  });

  it("resets tab to active", () => {
    let state = reducer(initial, setAlgoMonitorTab("history"));
    state = reducer(state, setAlgoMonitorTab("active"));
    expect(state.algoMonitorTab).toBe("active");
  });
});

describe("uiSlice – setShowHeartbeats", () => {
  it("sets showHeartbeats to true", () => {
    const state = reducer(initial, setShowHeartbeats(true));
    expect(state.showHeartbeats).toBe(true);
  });

  it("sets showHeartbeats back to false", () => {
    let state = reducer(initial, setShowHeartbeats(true));
    state = reducer(state, setShowHeartbeats(false));
    expect(state.showHeartbeats).toBe(false);
  });
});

describe("uiSlice – setObservabilityTab", () => {
  it("sets tab to trades", () => {
    const state = reducer(initial, setObservabilityTab("trades"));
    expect(state.observabilityTab).toBe("trades");
  });

  it("sets tab to events", () => {
    const state = reducer(initial, setObservabilityTab("events"));
    expect(state.observabilityTab).toBe("events");
  });

  it("resets tab to summary", () => {
    let state = reducer(initial, setObservabilityTab("events"));
    state = reducer(state, setObservabilityTab("summary"));
    expect(state.observabilityTab).toBe("summary");
  });
});

describe("uiSlice – setShowOverridesOnly", () => {
  it("sets showOverridesOnly to true", () => {
    const state = reducer(initial, setShowOverridesOnly(true));
    expect(state.showOverridesOnly).toBe(true);
  });

  it("sets showOverridesOnly back to false", () => {
    let state = reducer(initial, setShowOverridesOnly(true));
    state = reducer(state, setShowOverridesOnly(false));
    expect(state.showOverridesOnly).toBe(false);
  });
});

describe("uiSlice – loadUiPrefs.fulfilled", () => {
  it("restores all persisted ui fields from blob", () => {
    const state = reducer(
      initial,
      loadUiPrefs.fulfilled(
        {
          orderTicketWindowSize: { w: 600, h: 900 },
          activeStrategy: "VWAP",
          activeSide: "SELL",
          selectedAsset: "MSFT",
          algoMonitorTab: "history",
          showHeartbeats: true,
          observabilityTab: "trades",
          showOverridesOnly: true,
        },
        "",
        undefined
      )
    );
    expect(state.orderTicketWindowSize).toEqual({ w: 600, h: 900 });
    expect(state.activeStrategy).toBe("VWAP");
    expect(state.activeSide).toBe("SELL");
    expect(state.selectedAsset).toBe("MSFT");
    expect(state.algoMonitorTab).toBe("history");
    expect(state.showHeartbeats).toBe(true);
    expect(state.observabilityTab).toBe("trades");
    expect(state.showOverridesOnly).toBe(true);
  });

  it("leaves all fields unchanged when payload is null", () => {
    const state = reducer(initial, loadUiPrefs.fulfilled(null, "", undefined));
    expect(state).toEqual(initial);
  });

  it("applies partial payload — only updates provided fields", () => {
    const state = reducer(initial, loadUiPrefs.fulfilled({ activeStrategy: "POV" }, "", undefined));
    expect(state.activeStrategy).toBe("POV");
    expect(state.activeSide).toBe("BUY");
    expect(state.algoMonitorTab).toBe("active");
  });

  it("ignores invalid strategy values at the thunk parse level", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ activeStrategy: "UNKNOWN" }),
      })
    );
    const result = await loadUiPrefs()(
      vi.fn(),
      vi.fn(() => ({})),
      undefined
    );
    expect((result.payload as Record<string, unknown>)?.activeStrategy).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("ignores invalid algoMonitorTab values at the thunk parse level", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ algoMonitorTab: "bad" }),
      })
    );
    const result = await loadUiPrefs()(
      vi.fn(),
      vi.fn(() => ({})),
      undefined
    );
    expect((result.payload as Record<string, unknown>)?.algoMonitorTab).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("uiSlice – loadUiPrefs thunk (integration)", () => {
  it("fetches and parses all persisted fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          orderTicketWindowSize: { w: 700, h: 950 },
          activeStrategy: "ICEBERG",
          activeSide: "SELL",
          selectedAsset: "TSLA",
          algoMonitorTab: "needs-action",
          showHeartbeats: true,
          observabilityTab: "events",
          showOverridesOnly: true,
        }),
      })
    );
    const result = await loadUiPrefs()(
      vi.fn(),
      vi.fn(() => ({})),
      undefined
    );
    expect(result.payload).toMatchObject({
      orderTicketWindowSize: { w: 700, h: 950 },
      activeStrategy: "ICEBERG",
      activeSide: "SELL",
      selectedAsset: "TSLA",
      algoMonitorTab: "needs-action",
      showHeartbeats: true,
      observabilityTab: "events",
      showOverridesOnly: true,
    });
    vi.unstubAllGlobals();
  });

  it("returns null when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await loadUiPrefs()(
      vi.fn(),
      vi.fn(() => ({})),
      undefined
    );
    expect(result.payload).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns empty prefs object when blob has no known fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ theme: "dark" }),
      })
    );
    const result = await loadUiPrefs()(
      vi.fn(),
      vi.fn(() => ({})),
      undefined
    );
    expect(result.payload).toEqual({});
    vi.unstubAllGlobals();
  });
});

describe("uiSlice – saveUiPrefs thunk", () => {
  it("writes all ui prefs fields to the preferences endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ theme: "dark" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const getState = vi.fn(() => ({
      ui: {
        orderTicketWindowSize: { w: 500, h: 800 },
        activeStrategy: "VWAP",
        activeSide: "SELL",
        selectedAsset: "AAPL",
        algoMonitorTab: "history",
        showHeartbeats: true,
        observabilityTab: "trades",
        showOverridesOnly: false,
      },
    }));

    await saveUiPrefs()(vi.fn(), getState, undefined);

    const putCall = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(putCall).toBeDefined();
    const body = JSON.parse(putCall?.[1].body);
    expect(body.activeStrategy).toBe("VWAP");
    expect(body.activeSide).toBe("SELL");
    expect(body.selectedAsset).toBe("AAPL");
    expect(body.algoMonitorTab).toBe("history");
    expect(body.showHeartbeats).toBe(true);
    expect(body.observabilityTab).toBe("trades");
    expect(body.showOverridesOnly).toBe(false);
    expect(body.orderTicketWindowSize).toEqual({ w: 500, h: 800 });
    vi.unstubAllGlobals();
  });
});
