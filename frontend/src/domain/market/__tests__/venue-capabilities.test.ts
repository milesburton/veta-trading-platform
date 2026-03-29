import { describe, expect, it } from "vitest";
import { getVenueCapabilities, LIT_EQUITY_VENUES, VENUE_REGISTRY } from "../venue-capabilities";

describe("VENUE_REGISTRY", () => {
  it("has entries for all 11 venue MICs", () => {
    for (const mic of [
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
    ]) {
      expect(VENUE_REGISTRY).toHaveProperty(mic);
    }
  });

  it.each([
    ["DARK1", { isDark: true, minQuantity: 10_000, supportsMarketOrders: false }],
    ["IEX", { supportsMarketOrders: false }],
    ["BATS", { supportsAuction: false }],
    ["EDGX", { supportsIceberg: false }],
    ["RFQ", { supportedStrategies: ["LIMIT"] }],
  ] as const)("%s capabilities", (mic, expected) => {
    const venue = VENUE_REGISTRY[mic as keyof typeof VENUE_REGISTRY];
    for (const [key, value] of Object.entries(expected)) {
      expect(venue[key as keyof typeof venue]).toEqual(value);
    }
  });

  it("XNAS supports all order types and auctions", () => {
    const nasdaq = VENUE_REGISTRY.XNAS;
    expect(nasdaq.supportsMarketOrders).toBe(true);
    expect(nasdaq.supportsLimitOrders).toBe(true);
    expect(nasdaq.supportsIceberg).toBe(true);
    expect(nasdaq.supportsAuction).toBe(true);
    expect(nasdaq.supportedStrategies.length).toBeGreaterThan(5);
  });
});

describe("getVenueCapabilities", () => {
  it("returns capabilities for known venue", () => {
    expect(getVenueCapabilities("XNYS")?.name).toBe("NYSE");
  });

  it("returns undefined for unknown venue", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing unknown MIC
    expect(getVenueCapabilities("UNKNOWN" as any)).toBeUndefined();
  });
});

describe("LIT_EQUITY_VENUES", () => {
  it("contains 7 lit venues, excludes DARK1", () => {
    expect(LIT_EQUITY_VENUES).toHaveLength(7);
    expect(LIT_EQUITY_VENUES).not.toContain("DARK1");
  });
});
