import { describe, expect, it } from "vitest";
import { type DraftLeg, newLegKey, toLegPayloads } from "../legs";

describe("newLegKey", () => {
  it("returns unique increasing keys", () => {
    const a = newLegKey();
    const b = newLegKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^dleg-\d+$/);
  });
});

describe("toLegPayloads", () => {
  it("converts weight from percent to decimal", () => {
    const leg: DraftLeg = { _key: "k1", type: "equity", symbol: "AAPL", weight: 25 };
    expect(toLegPayloads([leg])).toEqual([{ type: "equity", symbol: "AAPL", weight: 0.25 }]);
  });

  it("includes isin when present", () => {
    const leg: DraftLeg = {
      _key: "k2",
      type: "bond",
      symbol: "US10Y",
      weight: 50,
      isin: "US0000",
    };
    expect(toLegPayloads([leg])[0].isin).toBe("US0000");
  });

  it("builds optionSpec for option legs with strike + expiry", () => {
    const leg: DraftLeg = {
      _key: "k3",
      type: "option",
      symbol: "AAPL",
      weight: 100,
      optionStrike: "150",
      optionExpiry: "2026-12-19",
      optionPutCall: "PUT",
    };
    expect(toLegPayloads([leg])[0].optionSpec).toEqual({
      strike: 150,
      expiry: "2026-12-19",
      putCall: "PUT",
    });
  });

  it("defaults option putCall to CALL when not set", () => {
    const leg: DraftLeg = {
      _key: "k4",
      type: "option",
      symbol: "TSLA",
      weight: 100,
      optionStrike: "300",
      optionExpiry: "2027-01-15",
    };
    expect(toLegPayloads([leg])[0].optionSpec?.putCall).toBe("CALL");
  });

  it("omits optionSpec when type is option but strike/expiry missing", () => {
    const leg: DraftLeg = {
      _key: "k5",
      type: "option",
      symbol: "GOOG",
      weight: 100,
    };
    expect(toLegPayloads([leg])[0].optionSpec).toBeUndefined();
  });

  it("never adds optionSpec to non-option legs", () => {
    const leg: DraftLeg = {
      _key: "k6",
      type: "equity",
      symbol: "MSFT",
      weight: 100,
      optionStrike: "100",
      optionExpiry: "2026-06-19",
    };
    expect(toLegPayloads([leg])[0].optionSpec).toBeUndefined();
  });

  it("handles a multi-leg basket", () => {
    const legs: DraftLeg[] = [
      { _key: "a", type: "equity", symbol: "AAPL", weight: 60 },
      { _key: "b", type: "equity", symbol: "MSFT", weight: 40 },
    ];
    const payloads = toLegPayloads(legs);
    expect(payloads).toHaveLength(2);
    expect(payloads[0].weight + payloads[1].weight).toBeCloseTo(1.0);
  });
});
