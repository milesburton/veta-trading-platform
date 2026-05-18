import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BuildPayloadInputs, buildKillPayloads, buildResumePayload } from "../payloads";

function inputs(overrides: Partial<BuildPayloadInputs> = {}): BuildPayloadInputs {
  return {
    scope: "all",
    scopeValues: [],
    isAdmin: false,
    targetUserId: "",
    ...overrides,
  };
}

describe("buildKillPayloads", () => {
  it("returns a single payload when no scope values are selected", () => {
    expect(buildKillPayloads(inputs({ scope: "all" }))).toEqual([{ scope: "all" }]);
  });

  it("returns one payload per scope value", () => {
    expect(buildKillPayloads(inputs({ scope: "symbol", scopeValues: ["AAPL", "MSFT"] }))).toEqual([
      { scope: "symbol", scopeValue: "AAPL" },
      { scope: "symbol", scopeValue: "MSFT" },
    ]);
  });

  it("includes targetUserId when admin targets a specific user", () => {
    expect(
      buildKillPayloads(inputs({ scope: "user", isAdmin: true, targetUserId: "u-99" }))
    ).toEqual([{ scope: "user", targetUserId: "u-99" }]);
  });

  it("ignores targetUserId for non-admin", () => {
    expect(
      buildKillPayloads(inputs({ scope: "user", isAdmin: false, targetUserId: "u-99" }))
    ).toEqual([{ scope: "user" }]);
  });

  it("ignores targetUserId outside user scope", () => {
    expect(
      buildKillPayloads(
        inputs({
          scope: "symbol",
          isAdmin: true,
          targetUserId: "u-99",
          scopeValues: ["AAPL"],
        })
      )
    ).toEqual([{ scope: "symbol", scopeValue: "AAPL" }]);
  });
});

describe("buildResumePayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds an immediate resume payload", () => {
    expect(
      buildResumePayload({
        ...inputs({ scope: "all" }),
        resumeMode: "immediate",
        resumeMinutes: "",
      })
    ).toEqual({ scope: "all" });
  });

  it("uses only the first scopeValue", () => {
    expect(
      buildResumePayload({
        ...inputs({ scope: "symbol", scopeValues: ["AAPL", "MSFT"] }),
        resumeMode: "immediate",
        resumeMinutes: "",
      })
    ).toEqual({ scope: "symbol", scopeValue: "AAPL" });
  });

  it("computes resumeAt from now + minutes when scheduled", () => {
    const payload = buildResumePayload({
      ...inputs({ scope: "all" }),
      resumeMode: "scheduled",
      resumeMinutes: "5",
    });
    expect(payload.resumeAt).toBe(1_700_000_000_000 + 5 * 60_000);
  });

  it("omits resumeAt when scheduled but minutes is empty", () => {
    const payload = buildResumePayload({
      ...inputs({ scope: "all" }),
      resumeMode: "scheduled",
      resumeMinutes: "",
    });
    expect(payload.resumeAt).toBeUndefined();
  });
});
