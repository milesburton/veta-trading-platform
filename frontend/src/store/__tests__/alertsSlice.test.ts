import { describe, expect, it } from "vitest";
import { alertAdded, alertsSlice } from "../alertsSlice";

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
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });

    try {
      const state = reducer(undefined, alertAdded(BASE_ALERT));
      expect(state.alerts).toHaveLength(1);
      expect(typeof state.alerts[0].id).toBe("string");
      expect(state.alerts[0].id.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });

  it("prepends new alerts (most recent first)", () => {
    let state = reducer(undefined, alertAdded({ ...BASE_ALERT, message: "first" }));
    state = reducer(state, alertAdded({ ...BASE_ALERT, message: "second" }));
    expect(state.alerts[0].message).toBe("second");
    expect(state.alerts[1].message).toBe("first");
  });
});
