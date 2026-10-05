import {
  marketHoursMode,
  marketHoursModeDetail,
} from "@veta/frontend/domain/market/marketHoursMode";
import type { MarketHoursConfig } from "@veta/frontend/store/gatewayApi";
import { describe, expect, it } from "vitest";

function config(overrides: [boolean, boolean, boolean, boolean]): MarketHoursConfig {
  const [equity, fx, commodity, bond] = overrides;
  const entry = (calendarLabel: string, isOpen: boolean, allowOutOfHoursOverride: boolean) => ({
    calendarLabel,
    isOpen,
    phase: isOpen ? "Continuous Trading" : "Market Closed",
    allowOutOfHoursOverride,
  });
  return {
    assetClasses: {
      equity: entry("XNAS", false, equity),
      fx: entry("FX", true, fx),
      commodity: entry("XCME", false, commodity),
      bond: entry("SIFMA", false, bond),
    },
  };
}

describe("marketHoursMode", () => {
  it("is simulated when every asset class ticks out of hours", () => {
    expect(marketHoursMode(config([true, true, true, true]))).toBe("simulated");
  });

  it("is real when no asset class ticks out of hours", () => {
    expect(marketHoursMode(config([false, false, false, false]))).toBe("real");
  });

  it("is mixed when only some asset classes tick out of hours", () => {
    expect(marketHoursMode(config([false, true, false, false]))).toBe("mixed");
  });
});

describe("marketHoursModeDetail", () => {
  it("lists each asset class with its real session and whether it is simulated", () => {
    expect(marketHoursModeDetail(config([true, false, true, false]))).toEqual([
      "Equities (XNAS): real session closed, simulated, ticks around the clock",
      "FX (FX): real session open, follows real hours",
      "Commodities (XCME): real session closed, simulated, ticks around the clock",
      "Bonds (SIFMA): real session closed, follows real hours",
    ]);
  });
});
