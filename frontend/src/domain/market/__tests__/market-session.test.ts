import { describe, expect, it } from "vitest";
import { isAuction, isStrategyAllowedInSession, resolveSession } from "../market-session";

describe("resolveSession", () => {
  it("PRE_OPEN allows order entry but only LIMIT", () => {
    const s = resolveSession("PRE_OPEN");
    expect(s.allowsOrderEntry).toBe(true);
    expect(s.allowsAmend).toBe(true);
    expect(s.supportedStrategies).toEqual(["LIMIT"]);
    expect(s.phaseLabel).toBe("Pre-Open");
  });

  it("OPENING_AUCTION allows entry, only LIMIT", () => {
    const s = resolveSession("OPENING_AUCTION");
    expect(s.allowsOrderEntry).toBe(true);
    expect(s.supportedStrategies).toEqual(["LIMIT"]);
  });

  it("CONTINUOUS allows all strategies", () => {
    const s = resolveSession("CONTINUOUS");
    expect(s.allowsOrderEntry).toBe(true);
    expect(s.allowsAmend).toBe(true);
    expect(s.allowsCancel).toBe(true);
    expect(s.supportedStrategies.length).toBeGreaterThan(5);
    expect(s.supportedStrategies).toContain("TWAP");
    expect(s.supportedStrategies).toContain("VWAP");
  });

  it("CLOSING_AUCTION disallows amend", () => {
    const s = resolveSession("CLOSING_AUCTION");
    expect(s.allowsOrderEntry).toBe(true);
    expect(s.allowsAmend).toBe(false);
    expect(s.allowsCancel).toBe(true);
    expect(s.supportedStrategies).toEqual(["LIMIT"]);
  });

  it("HALTED blocks entry and amend, allows cancel", () => {
    const s = resolveSession("HALTED");
    expect(s.allowsOrderEntry).toBe(false);
    expect(s.allowsAmend).toBe(false);
    expect(s.allowsCancel).toBe(true);
    expect(s.supportedStrategies).toHaveLength(0);
  });

  it("CLOSED blocks everything", () => {
    const s = resolveSession("CLOSED");
    expect(s.allowsOrderEntry).toBe(false);
    expect(s.allowsAmend).toBe(false);
    expect(s.allowsCancel).toBe(false);
    expect(s.supportedStrategies).toHaveLength(0);
  });

  it("passes through nextTransitionAt", () => {
    const ts = Date.now() + 60_000;
    const s = resolveSession("PRE_OPEN", ts);
    expect(s.nextTransitionAt).toBe(ts);
  });
});

describe("isStrategyAllowedInSession", () => {
  it("LIMIT is allowed in all entry-permitting phases", () => {
    for (const phase of ["PRE_OPEN", "OPENING_AUCTION", "CONTINUOUS", "CLOSING_AUCTION"] as const) {
      const s = resolveSession(phase);
      expect(isStrategyAllowedInSession(s, "LIMIT")).toBe(true);
    }
  });

  it("TWAP is only allowed in CONTINUOUS", () => {
    expect(isStrategyAllowedInSession(resolveSession("CONTINUOUS"), "TWAP")).toBe(true);
    expect(isStrategyAllowedInSession(resolveSession("OPENING_AUCTION"), "TWAP")).toBe(false);
    expect(isStrategyAllowedInSession(resolveSession("HALTED"), "TWAP")).toBe(false);
  });
});

describe("isAuction", () => {
  it("returns true for OPENING_AUCTION and CLOSING_AUCTION", () => {
    expect(isAuction("OPENING_AUCTION")).toBe(true);
    expect(isAuction("CLOSING_AUCTION")).toBe(true);
  });

  it("returns false for all other phases", () => {
    expect(isAuction("PRE_OPEN")).toBe(false);
    expect(isAuction("CONTINUOUS")).toBe(false);
    expect(isAuction("HALTED")).toBe(false);
    expect(isAuction("CLOSED")).toBe(false);
  });
});
