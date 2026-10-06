import { exchangeLabel, exchangeStatus } from "@veta/frontend/domain/market/exchangeStatus.ts";
import type { MarketHoursConfig } from "@veta/frontend/store/gatewayApi.ts";
import { describe, expect, it } from "vitest";

function session(calendarLabel: string, isOpen: boolean, phase: string) {
  return { calendarLabel, isOpen, phase, allowOutOfHoursOverride: false };
}

const config: MarketHoursConfig = {
  assetClasses: {
    equity: session("XNYS", true, "Continuous Trading"),
    fx: session("XFX", false, "Weekend"),
    commodity: session("XCME", false, "Market Closed"),
    bond: session("XBND", true, "Open"),
  },
};

describe("exchangeLabel", () => {
  it("maps known MICs to their common names", () => {
    expect(exchangeLabel("XNAS")).toBe("NASDAQ");
    expect(exchangeLabel("XNYM")).toBe("NYMEX");
  });

  it("falls back to the MIC for unknown venues", () => {
    expect(exchangeLabel("XLON")).toBe("XLON");
  });
});

describe("exchangeStatus", () => {
  it("uses the asset's own exchange with its asset-class session", () => {
    expect(exchangeStatus({ exchange: "XNAS", assetClass: "equity" }, config)).toEqual({
      label: "NASDAQ",
      mic: "XNAS",
      isOpen: true,
      phase: "Continuous Trading",
    });
  });

  it("reports a closed session for the asset's class", () => {
    expect(exchangeStatus({ exchange: "XCME", assetClass: "commodity" }, config)).toMatchObject({
      label: "CME",
      isOpen: false,
      phase: "Market Closed",
    });
  });

  it("treats assets without a class as equities", () => {
    expect(exchangeStatus({ exchange: "XNYS" }, config)?.isOpen).toBe(true);
  });

  it("falls back to the calendar label when the asset has no exchange", () => {
    expect(exchangeStatus({ assetClass: "fx" }, config)).toMatchObject({
      mic: "XFX",
      isOpen: false,
    });
  });
});
