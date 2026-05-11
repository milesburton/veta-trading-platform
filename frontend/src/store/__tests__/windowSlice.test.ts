import { describe, expect, it } from "vitest";
import {
  panelClosed,
  panelDialogClosed,
  panelDialogOpened,
  panelPopped,
  windowSlice,
} from "../windowSlice";

const { reducer } = windowSlice;
const initial = reducer(undefined, { type: "@@init" });

// windowSlice now uses a dynamic string-keyed record — no pre-initialised entries.

describe("windowSlice – initial state", () => {
  it("starts with an empty popOuts record", () => {
    expect(initial.popOuts).toEqual({});
  });

  it("unknown panel IDs are treated as closed (undefined coerced to false)", () => {
    expect(initial.popOuts["order-blotter"]?.open ?? false).toBe(false);
  });
});

describe("windowSlice – panelPopped", () => {
  for (const panelId of [
    "order-blotter",
    "algo-monitor",
    "observability",
    "market-ladder",
  ] as const) {
    it(`marks ${panelId} as open`, () => {
      const state = reducer(initial, panelPopped({ panelId }));
      expect(state.popOuts[panelId].open).toBe(true);
    });
  }

  it("does not affect other panels when one is popped", () => {
    const state = reducer(initial, panelPopped({ panelId: "order-blotter" }));
    expect(state.popOuts["algo-monitor"]?.open ?? false).toBe(false);
    expect(state.popOuts.observability?.open ?? false).toBe(false);
    expect(state.popOuts["market-ladder"]?.open ?? false).toBe(false);
  });
});

describe("windowSlice – panelClosed", () => {
  it("marks an open panel as closed", () => {
    let state = reducer(initial, panelPopped({ panelId: "algo-monitor" }));
    expect(state.popOuts["algo-monitor"].open).toBe(true);
    state = reducer(state, panelClosed({ panelId: "algo-monitor" }));
    expect(state.popOuts["algo-monitor"].open).toBe(false);
  });

  it("closing an already-closed panel is idempotent (entry absent → still false)", () => {
    const state = reducer(initial, panelClosed({ panelId: "market-ladder" }));
    expect(state.popOuts["market-ladder"]?.open ?? false).toBe(false);
  });

  it("does not affect other panels when one is closed", () => {
    let state = reducer(initial, panelPopped({ panelId: "order-blotter" }));
    state = reducer(state, panelPopped({ panelId: "algo-monitor" }));
    state = reducer(state, panelClosed({ panelId: "order-blotter" }));
    expect(state.popOuts["algo-monitor"].open).toBe(true);
  });
});

describe("windowSlice – panelDialogOpened", () => {
  it("opens a dialog with the given panel type", () => {
    const state = reducer(
      initial,
      panelDialogOpened({ panelId: "limits", panelType: "admin-limits" })
    );
    expect(state.dialogs.limits).toEqual({ open: true, panelType: "admin-limits" });
  });

  it("rejects unsafe keys (prototype pollution guard)", () => {
    const state = reducer(initial, panelDialogOpened({ panelId: "__proto__", panelType: "x" }));
    expect(Object.hasOwn(state.dialogs, "__proto__")).toBe(false);
  });
});

describe("windowSlice – panelDialogClosed", () => {
  it("flips open=false on an existing dialog", () => {
    let state = reducer(
      initial,
      panelDialogOpened({ panelId: "limits", panelType: "admin-limits" })
    );
    state = reducer(state, panelDialogClosed({ panelId: "limits" }));
    expect(state.dialogs.limits.open).toBe(false);
  });

  it("is a no-op when the dialog was never opened", () => {
    const state = reducer(initial, panelDialogClosed({ panelId: "never-existed" }));
    expect(state.dialogs["never-existed"]).toBeUndefined();
  });

  it("rejects unsafe keys on close", () => {
    const state = reducer(initial, panelDialogClosed({ panelId: "constructor" }));
    expect(state).toEqual(initial);
  });
});

describe("windowSlice – isSafeKey guard on popOuts", () => {
  it("panelPopped rejects __proto__", () => {
    const state = reducer(initial, panelPopped({ panelId: "__proto__" }));
    expect(Object.hasOwn(state.popOuts, "__proto__")).toBe(false);
  });

  it("panelClosed rejects __proto__", () => {
    const state = reducer(initial, panelClosed({ panelId: "__proto__" }));
    expect(state).toEqual(initial);
  });
});

describe("windowSlice – round-trip pop/close", () => {
  it("can pop and close multiple times", () => {
    let state = reducer(initial, panelPopped({ panelId: "observability" }));
    expect(state.popOuts.observability.open).toBe(true);
    state = reducer(state, panelClosed({ panelId: "observability" }));
    expect(state.popOuts.observability.open).toBe(false);
    state = reducer(state, panelPopped({ panelId: "observability" }));
    expect(state.popOuts.observability.open).toBe(true);
  });

  it("works with arbitrary instance IDs (multi-instance panels)", () => {
    const id = "order-blotter-1714000000000";
    let state = reducer(initial, panelPopped({ panelId: id }));
    expect(state.popOuts[id].open).toBe(true);
    state = reducer(state, panelClosed({ panelId: id }));
    expect(state.popOuts[id].open).toBe(false);
  });
});
