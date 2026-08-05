import { alertAdded, alertsSlice } from "@veta/frontend/store/alertsSlice";
import { describe, expect, it } from "vitest";

const { reducer } = alertsSlice;

const BASE_ALERT = {
  severity: "WARNING" as const,
  source: "service" as const,
  message: "test alert",
  ts: Date.now(),
};

describe("alertsSlice — alertAdded", () => {
  it("adds an alert with a generated id", () => {
    const state = reducer(undefined, alertAdded(BASE_ALERT));
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].id).toBeTruthy();
    expect(state.alerts[0].dismissed).toBe(false);
    expect(state.alerts[0].message).toBe("test alert");
  });

  it("generates a valid id when crypto.randomUUID is available", () => {
    const state = reducer(undefined, alertAdded(BASE_ALERT));
    expect(typeof state.alerts[0].id).toBe("string");
    expect(state.alerts[0].id.length).toBeGreaterThan(0);
  });

  it("generates a valid id when crypto.randomUUID is unavailable (non-secure context)", () => {
    // Simulate HTTP (non-secure) context where randomUUID is not available
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });

    try {
      const state = reducer(undefined, alertAdded(BASE_ALERT));
      expect(state.alerts).toHaveLength(1);
      expect(typeof state.alerts[0].id).toBe("string");
      expect(state.alerts[0].id.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(crypto, "randomUUID", {
        value: original,
        configurable: true,
      });
    }
  });

  it("prepends new alerts (most recent first)", () => {
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, message: "first" }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, message: "second" }));
    expect(state.alerts[0].message).toBe("second");
    expect(state.alerts[1].message).toBe("first");
  });
});

describe("alertsSlice — source field", () => {
  it("service alerts carry source=service so callers can filter them separately from user-facing toasts", () => {
    const state = reducer(undefined, alertAdded({ ...BASE_ALERT, source: "service" }));
    expect(state.alerts[0].source).toBe("service");
  });

  it("non-service alerts carry a distinct source", () => {
    const state = reducer(
      undefined,
      alertAdded({ ...BASE_ALERT, source: "order", message: "Order rejected" })
    );
    expect(state.alerts[0].source).toBe("order");
  });

  it("service and non-service alerts are distinguishable by source in the same state", () => {
    let state = reducer(
      undefined,
      alertAdded({
        ...BASE_ALERT,
        source: "service",
        message: "EMS: service down",
      })
    );
    state = reducer(
      state,
      alertAdded({ ...BASE_ALERT, source: "order", message: "Order rejected" })
    );
    const serviceAlerts = state.alerts.filter((a) => a.source === "service");
    const otherAlerts = state.alerts.filter((a) => a.source !== "service");
    expect(serviceAlerts).toHaveLength(1);
    expect(otherAlerts).toHaveLength(1);
  });
});

describe("alertsSlice — dedupe", () => {
  it("identical alerts within window collapse into one with count", () => {
    const t0 = 1_700_000_000_000;
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, ts: t0 }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 5_000 }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 12_000 }));
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].count).toBe(3);
    expect(state.alerts[0].ts).toBe(t0);
    expect(state.alerts[0].lastTs).toBe(t0 + 12_000);
  });

  it("different message creates a separate alert", () => {
    const t0 = 1_700_000_000_000;
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, ts: t0, message: "a" }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 1_000, message: "b" }));
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts[0].message).toBe("b");
    expect(state.alerts[0].count).toBe(1);
  });

  it("alert outside the 30s dedupe window starts a fresh row", () => {
    const t0 = 1_700_000_000_000;
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, ts: t0 }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 31_000 }));
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts[0].count).toBe(1);
    expect(state.alerts[1].count).toBe(1);
  });

  it("dismissed alerts do not absorb new occurrences", () => {
    const t0 = 1_700_000_000_000;
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, ts: t0 }));
    state = reducer(state, alertsSlice.actions.alertDismissed(state.alerts[0].id));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 5_000 }));
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts[0].count).toBe(1);
    expect(state.alerts[0].dismissed).toBe(false);
  });

  it("re-firing brings the existing alert back to the top", () => {
    const t0 = 1_700_000_000_000;
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, ts: t0, message: "old" }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 1_000, message: "newer" }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 2_000, message: "old" }));
    expect(state.alerts[0].message).toBe("old");
    expect(state.alerts[0].count).toBe(2);
    expect(state.alerts[1].message).toBe("newer");
  });

  it("re-firing clears the acknowledged flag so the toast resurfaces", () => {
    const t0 = 1_700_000_000_000;
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, ts: t0 }));
    state = reducer(state, alertsSlice.actions.alertAcknowledged(state.alerts[0].id));
    expect(state.alerts[0].acknowledged).toBe(true);
    state = reducer(state, alertAdded({ ...BASE_ALERT, ts: t0 + 5_000 }));
    expect(state.alerts[0].count).toBe(2);
    expect(state.alerts[0].acknowledged).toBe(false);
  });
});

describe("alertsSlice — acknowledged + toast queue", () => {
  it("alertAcknowledged sets the flag without dismissing", () => {
    let state = reducer(undefined, alertAdded(BASE_ALERT));
    const id = state.alerts[0].id;
    state = reducer(state, alertsSlice.actions.alertAcknowledged(id));
    expect(state.alerts[0].acknowledged).toBe(true);
    expect(state.alerts[0].dismissed).toBe(false);
  });

  it("alertDismissed also acknowledges", () => {
    let state = reducer(undefined, alertAdded(BASE_ALERT));
    const id = state.alerts[0].id;
    state = reducer(state, alertsSlice.actions.alertDismissed(id));
    expect(state.alerts[0].dismissed).toBe(true);
    expect(state.alerts[0].acknowledged).toBe(true);
  });
});
