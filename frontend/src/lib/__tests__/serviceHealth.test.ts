import {
  deriveDisplayState,
  isExpectedAbsence,
  isHibernating,
} from "@veta/frontend/lib/serviceHealth.ts";
import { describe, expect, it } from "vitest";

describe("isHibernating", () => {
  it("is true for a tier 1+ service reporting error", () => {
    expect(isHibernating({ state: "error", tier: 1 })).toBe(true);
    expect(isHibernating({ state: "error", tier: 2 })).toBe(true);
    expect(isHibernating({ state: "error", tier: 3 })).toBe(true);
  });

  it("is false for a tier 0 service reporting error", () => {
    expect(isHibernating({ state: "error", tier: 0 })).toBe(false);
  });

  it("defaults to tier 0 when tier is omitted", () => {
    expect(isHibernating({ state: "error" })).toBe(false);
  });

  it("is false for any non-error state, regardless of tier", () => {
    expect(isHibernating({ state: "ok", tier: 1 })).toBe(false);
    expect(isHibernating({ state: "warn", tier: 1 })).toBe(false);
    expect(isHibernating({ state: "starting", tier: 1 })).toBe(false);
    expect(isHibernating({ state: "unknown", tier: 1 })).toBe(false);
  });
});

describe("deriveDisplayState", () => {
  it("maps a hibernating service to 'asleep'", () => {
    expect(deriveDisplayState({ state: "error", tier: 1 })).toBe("asleep");
  });

  it("passes through every other state unchanged", () => {
    expect(deriveDisplayState({ state: "ok", tier: 1 })).toBe("ok");
    expect(deriveDisplayState({ state: "warn", tier: 1 })).toBe("warn");
    expect(deriveDisplayState({ state: "starting", tier: 1 })).toBe("starting");
    expect(deriveDisplayState({ state: "unknown", tier: 1 })).toBe("unknown");
    expect(deriveDisplayState({ state: "error", tier: 0 })).toBe("error");
  });
});

describe("isExpectedAbsence", () => {
  it("is true when optional, regardless of tier or state", () => {
    expect(isExpectedAbsence({ state: "error", optional: true, tier: 0 })).toBe(true);
    expect(isExpectedAbsence({ state: "ok", optional: true, tier: 0 })).toBe(true);
  });

  it("is true when hibernating, regardless of optional", () => {
    expect(isExpectedAbsence({ state: "error", optional: false, tier: 1 })).toBe(true);
  });

  it("is false when neither optional nor hibernating", () => {
    expect(isExpectedAbsence({ state: "error", optional: false, tier: 0 })).toBe(false);
    expect(isExpectedAbsence({ state: "ok", tier: 0 })).toBe(false);
  });
});
