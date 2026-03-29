import { describe, expect, it } from "vitest";
import { getVenueCapabilities, LIT_EQUITY_VENUES, VENUE_REGISTRY } from "../venue-capabilities";

describe("VENUE_REGISTRY", () => {
  it("has entries for all 11 venue MICs", () => {
    const expected = [
      "XNAS",
      "XNYS",
      "ARCX",
      "BATS",
      "EDGX",
      "IEX",
      "MEMX",
      "DARK1",
      "RFQ",
      "EBS",
      "XCME",
    ];
    for (const mic of expected) {
      expect(VENUE_REGISTRY).toHaveProperty(mic);
    }
  });

  it("DARK1 is marked as dark with minQuantity", () => {
    const dark = VENUE_REGISTRY.DARK1;
    expect(dark.isDark).toBe(true);
    expect(dark.minQuantity).toBe(10_000);
    expect(dark.supportsMarketOrders).toBe(false);
  });

  it("IEX does not support market orders", () => {
    expect(VENUE_REGISTRY.IEX.supportsMarketOrders).toBe(false);
  });

  it("XNAS supports all strategies and order types", () => {
    const nasdaq = VENUE_REGISTRY.XNAS;
    expect(nasdaq.supportsMarketOrders).toBe(true);
    expect(nasdaq.supportsLimitOrders).toBe(true);
    expect(nasdaq.supportsIceberg).toBe(true);
    expect(nasdaq.supportsAuction).toBe(true);
    expect(nasdaq.supportedStrategies.length).toBeGreaterThan(5);
  });

  it("BATS does not support auctions", () => {
    expect(VENUE_REGISTRY.BATS.supportsAuction).toBe(false);
  });

  it("EDGX does not support iceberg", () => {
    expect(VENUE_REGISTRY.EDGX.supportsIceberg).toBe(false);
  });

  it("RFQ only supports LIMIT", () => {
    expect(VENUE_REGISTRY.RFQ.supportedStrategies).toEqual(["LIMIT"]);
  });
});

describe("getVenueCapabilities", () => {
  it("returns capabilities for known venue", () => {
    const caps = getVenueCapabilities("XNYS");
    expect(caps?.name).toBe("NYSE");
  });

  it("returns undefined for unknown venue", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test for unknown MIC
    const caps = getVenueCapabilities("UNKNOWN" as any);
    expect(caps).toBeUndefined();
  });
});

describe("LIT_EQUITY_VENUES", () => {
  it("contains 7 lit venues", () => {
    expect(LIT_EQUITY_VENUES).toHaveLength(7);
  });

  it("does not include DARK1", () => {
    expect(LIT_EQUITY_VENUES).not.toContain("DARK1");
  });
});
