import { describe, expect, it } from "vitest";
import { isAuction, isStrategyAllowedInSession, resolveSession } from "../market-session";

describe("resolveSession", () => {
  it.each([
    ["PRE_OPEN", true, true, true, ["LIMIT"], "Pre-Open"],
    ["OPENING_AUCTION", true, true, true, ["LIMIT"], "Opening Auction"],
    ["CONTINUOUS", true, true, true, null, "Continuous Trading"],
    ["CLOSING_AUCTION", true, false, true, ["LIMIT"], "Closing Auction"],
    ["HALTED", false, false, true, [], "Trading Halted"],
    ["CLOSED", false, false, false, [], "Market Closed"],
  ] as const)("%s → entry=%s amend=%s cancel=%s", (phase, entry, amend, cancel, strategies, label) => {
    const s = resolveSession(phase);
    expect(s.allowsOrderEntry).toBe(entry);
    expect(s.allowsAmend).toBe(amend);
    expect(s.allowsCancel).toBe(cancel);
    expect(s.phaseLabel).toBe(label);
    if (strategies) expect(s.supportedStrategies).toEqual(strategies);
    if (phase === "CONTINUOUS") expect(s.supportedStrategies.length).toBeGreaterThan(5);
  });

  it("passes through nextTransitionAt", () => {
    const ts = Date.now() + 60_000;
    expect(resolveSession("PRE_OPEN", ts).nextTransitionAt).toBe(ts);
  });
});

describe("isStrategyAllowedInSession", () => {
  it.each([
    ["CONTINUOUS", "TWAP", true],
    ["OPENING_AUCTION", "TWAP", false],
    ["HALTED", "TWAP", false],
    ["CONTINUOUS", "LIMIT", true],
    ["PRE_OPEN", "LIMIT", true],
    ["CLOSING_AUCTION", "LIMIT", true],
  ] as const)("phase=%s strategy=%s → %s", (phase, strategy, expected) => {
    expect(isStrategyAllowedInSession(resolveSession(phase), strategy)).toBe(expected);
  });
});

describe("isAuction", () => {
  it.each([
    ["OPENING_AUCTION", true],
    ["CLOSING_AUCTION", true],
    ["PRE_OPEN", false],
    ["CONTINUOUS", false],
    ["HALTED", false],
    ["CLOSED", false],
  ] as const)("%s → %s", (phase, expected) => {
    expect(isAuction(phase)).toBe(expected);
  });
});
