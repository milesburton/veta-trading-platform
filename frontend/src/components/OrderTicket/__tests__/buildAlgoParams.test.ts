import { describe, expect, it } from "vitest";
import { type AlgoParamInputs, buildAlgoParams } from "../buildAlgoParams";

function inputs(overrides: Partial<AlgoParamInputs> = {}): AlgoParamInputs {
  return {
    twapSlices: "10",
    twapCap: "25",
    povRate: "10",
    povMin: "10",
    povMax: "500",
    vwapDev: "0.5",
    vwapStart: "0",
    vwapEnd: "300",
    icebergVisible: "100",
    sniperAggression: "80",
    sniperMaxVenues: "2",
    apUrgency: "50",
    apMaxSlippageBps: "30",
    isUrgency: "50",
    isMaxSlippageBps: "30",
    isMinSlices: "3",
    isMaxSlices: "10",
    momentumThreshold: "20",
    momentumMaxTranches: "5",
    momentumShortEma: "5",
    momentumLongEma: "20",
    momentumCooldown: "3",
    ...overrides,
  };
}

describe("buildAlgoParams", () => {
  it("returns LIMIT for unknown strategy", () => {
    expect(buildAlgoParams("UNKNOWN", inputs())).toEqual({ strategy: "LIMIT" });
  });

  it("returns LIMIT for LIMIT strategy", () => {
    expect(buildAlgoParams("LIMIT", inputs())).toEqual({ strategy: "LIMIT" });
  });

  it("builds TWAP params from string inputs", () => {
    expect(buildAlgoParams("TWAP", inputs({ twapSlices: "20", twapCap: "50" }))).toEqual({
      strategy: "TWAP",
      numSlices: 20,
      participationCap: 50,
    });
  });

  it("builds POV params", () => {
    expect(buildAlgoParams("POV", inputs({ povRate: "15", povMin: "50", povMax: "1000" }))).toEqual(
      {
        strategy: "POV",
        participationRate: 15,
        minSliceSize: 50,
        maxSliceSize: 1000,
      }
    );
  });

  it("builds VWAP params, converting percent maxDeviation to decimal", () => {
    expect(buildAlgoParams("VWAP", inputs({ vwapDev: "2.5" }))).toEqual({
      strategy: "VWAP",
      maxDeviation: 0.025,
      startOffsetSecs: 0,
      endOffsetSecs: 300,
    });
  });

  it("builds ICEBERG params", () => {
    expect(buildAlgoParams("ICEBERG", inputs({ icebergVisible: "250" }))).toEqual({
      strategy: "ICEBERG",
      visibleQty: 250,
    });
  });

  it("builds SNIPER params", () => {
    expect(buildAlgoParams("SNIPER", inputs())).toEqual({
      strategy: "SNIPER",
      aggressionPct: 80,
      maxVenues: 2,
    });
  });

  it("builds ARRIVAL_PRICE params", () => {
    expect(buildAlgoParams("ARRIVAL_PRICE", inputs())).toEqual({
      strategy: "ARRIVAL_PRICE",
      urgency: 50,
      maxSlippageBps: 30,
    });
  });

  it("builds IS params", () => {
    expect(buildAlgoParams("IS", inputs())).toEqual({
      strategy: "IS",
      urgency: 50,
      maxSlippageBps: 30,
      minSlices: 3,
      maxSlices: 10,
    });
  });

  it("builds MOMENTUM params with all 5 fields", () => {
    expect(buildAlgoParams("MOMENTUM", inputs())).toEqual({
      strategy: "MOMENTUM",
      entryThresholdBps: 20,
      maxTranches: 5,
      shortEmaPeriod: 5,
      longEmaPeriod: 20,
      cooldownTicks: 3,
    });
  });

  it("coerces non-numeric strings to NaN", () => {
    expect(buildAlgoParams("TWAP", inputs({ twapSlices: "not-a-number" }))).toEqual({
      strategy: "TWAP",
      numSlices: NaN,
      participationCap: 25,
    });
  });
});
