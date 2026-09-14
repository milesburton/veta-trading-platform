import {
  deriveDisplayState,
  isExpectedAbsence,
  isHibernating,
} from "@veta/frontend/lib/serviceHealth.ts";
import { describe, expect, it } from "vitest";

describe("isHibernating", () => {
  it("is true for a tier 1+ service reporting error with a confirmed connection-refused", () => {
    expect(isHibernating({ state: "error", tier: 1, connectionRefused: true })).toBe(true);
    expect(isHibernating({ state: "error", tier: 2, connectionRefused: true })).toBe(true);
    expect(isHibernating({ state: "error", tier: 3, connectionRefused: true })).toBe(true);
  });

  it("is false for a tier 0 service reporting error, even with connectionRefused", () => {
    expect(isHibernating({ state: "error", tier: 0, connectionRefused: true })).toBe(false);
  });

  it("defaults to tier 0 when tier is omitted", () => {
    expect(isHibernating({ state: "error", connectionRefused: true })).toBe(false);
  });

  it("is false for a tier 1+ service reporting error WITHOUT a confirmed connection-refused", () => {
    // A reachable-but-broken service (real HTTP 500, etc.) must not be
    // mistaken for hibernating — this is the regression case flagged in review.
    expect(isHibernating({ state: "error", tier: 1 })).toBe(false);
    expect(isHibernating({ state: "error", tier: 1, connectionRefused: false })).toBe(false);
  });

  it("is false for any non-error state, regardless of tier or connectionRefused", () => {
    expect(isHibernating({ state: "ok", tier: 1, connectionRefused: true })).toBe(false);
    expect(isHibernating({ state: "warn", tier: 1, connectionRefused: true })).toBe(false);
    expect(isHibernating({ state: "starting", tier: 1, connectionRefused: true })).toBe(false);
    expect(isHibernating({ state: "unknown", tier: 1, connectionRefused: true })).toBe(false);
  });
});

describe("deriveDisplayState", () => {
  it("maps a confirmed-hibernating service to 'asleep'", () => {
    expect(deriveDisplayState({ state: "error", tier: 1, connectionRefused: true })).toBe("asleep");
  });

  it("does not map a reachable-but-failing tier 1+ service to 'asleep'", () => {
    expect(deriveDisplayState({ state: "error", tier: 1 })).toBe("error");
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
  it("is true when optional, regardless of tier, state, or connectionRefused", () => {
    expect(isExpectedAbsence({ state: "error", optional: true, tier: 0 })).toBe(true);
    expect(isExpectedAbsence({ state: "ok", optional: true, tier: 0 })).toBe(true);
  });

  it("is true when hibernating (confirmed connection-refused), regardless of optional", () => {
    expect(
      isExpectedAbsence({ state: "error", optional: false, tier: 1, connectionRefused: true })
    ).toBe(true);
  });

  it("is false when neither optional nor confirmed-hibernating", () => {
    expect(isExpectedAbsence({ state: "error", optional: false, tier: 0 })).toBe(false);
    expect(isExpectedAbsence({ state: "ok", tier: 0 })).toBe(false);
    expect(isExpectedAbsence({ state: "error", optional: false, tier: 1 })).toBe(false);
  });
});
