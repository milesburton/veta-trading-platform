import { countsAsUp, isExpectedAbsence } from "@veta/frontend/lib/serviceHealth.ts";
import { describe, expect, it } from "vitest";

describe("isExpectedAbsence", () => {
  it("is true for a service on standby, optional or not", () => {
    expect(isExpectedAbsence({ state: "standby" })).toBe(true);
    expect(isExpectedAbsence({ state: "standby", optional: false })).toBe(true);
    expect(isExpectedAbsence({ state: "standby", optional: true })).toBe(true);
  });

  it("is true for an optional service in error", () => {
    expect(isExpectedAbsence({ state: "error", optional: true })).toBe(true);
  });

  it("is false for a required service in error", () => {
    expect(isExpectedAbsence({ state: "error", optional: false })).toBe(false);
    expect(isExpectedAbsence({ state: "error" })).toBe(false);
  });

  it("is false for any reachable state", () => {
    for (const state of ["ok", "warn", "starting", "unknown"] as const) {
      expect(isExpectedAbsence({ state, optional: true })).toBe(false);
      expect(isExpectedAbsence({ state })).toBe(false);
    }
  });
});

describe("countsAsUp", () => {
  it("counts ok and standby as up", () => {
    expect(countsAsUp("ok")).toBe(true);
    expect(countsAsUp("standby")).toBe(true);
  });

  it("does not count error, warn, starting or unknown as up", () => {
    for (const state of ["error", "warn", "starting", "unknown"] as const) {
      expect(countsAsUp(state)).toBe(false);
    }
  });
});
