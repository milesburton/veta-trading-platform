import { describe, expect, it, vi } from "vitest";
import {
  hideShortcuts,
  loadUiPrefs,
  saveOrderTicketWindowSize,
  setActiveSide,
  setActiveStrategy,
  setSelectedAsset,
  toggleShortcuts,
  uiSlice,
} from "../uiSlice";

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

describe("uiSlice – orderTicketWindowSize default", () => {
  it("defaults to 480×780", () => {
    expect(initial.orderTicketWindowSize).toEqual({ w: 480, h: 780 });
  });
});

describe("uiSlice – loadUiPrefs.fulfilled", () => {
  it("updates orderTicketWindowSize when payload is valid", () => {
    const state = reducer(initial, loadUiPrefs.fulfilled({ w: 600, h: 900 }, "", undefined));
    expect(state.orderTicketWindowSize).toEqual({ w: 600, h: 900 });
  });

  it("leaves orderTicketWindowSize unchanged when payload is null", () => {
    const state = reducer(initial, loadUiPrefs.fulfilled(null, "", undefined));
    expect(state.orderTicketWindowSize).toEqual({ w: 480, h: 780 });
  });
});

describe("uiSlice – saveOrderTicketWindowSize.fulfilled", () => {
  it("updates orderTicketWindowSize in state", () => {
    const size = { w: 550, h: 850 };
    const state = reducer(initial, saveOrderTicketWindowSize.fulfilled(size, "", size));
    expect(state.orderTicketWindowSize).toEqual(size);
  });
});

describe("uiSlice – loadUiPrefs thunk (integration)", () => {
  it("fetches preferences and resolves valid size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ orderTicketWindowSize: { w: 700, h: 950 } }),
      })
    );
    const result = await loadUiPrefs()(
      vi.fn(),
      vi.fn(() => ({})),
      undefined
    );
    expect(result.payload).toEqual({ w: 700, h: 950 });
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

  it("returns null when preferences blob lacks orderTicketWindowSize", async () => {
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
    expect(result.payload).toBeNull();
    vi.unstubAllGlobals();
  });
});
