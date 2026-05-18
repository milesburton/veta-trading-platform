import type { BondDef } from "@veta/frontend/data/bondUniverse.ts";
import type { AssetDef } from "@veta/frontend/types.ts";
import { describe, expect, it } from "vitest";
import { type BuildTradeInputs, buildTrade } from "../buildTrade";

const APPL: AssetDef = {
  symbol: "AAPL",
  exchange: "XNAS",
  lotSize: 1,
  initialPrice: 189.5,
  volatility: 0.25,
  sector: "Technology",
};

const UST10Y: BondDef = {
  isin: "US10Y",
  symbol: "US10Y",
  description: "US 10-Year Treasury",
  couponRate: 0.04,
  maturityDate: "2035-05-15",
  periodsPerYear: 2,
  totalPeriods: 20,
  creditRating: "AAA",
  issuer: "UST",
  initialYield: 0.045,
  faceValue: 100,
};

function inputs(overrides: Partial<BuildTradeInputs> = {}): BuildTradeInputs {
  return {
    selectedAsset: APPL,
    activeSide: "BUY",
    qty: 100,
    isOptions: false,
    isBond: false,
    optionType: "call",
    optionStrikeNum: 0,
    optionExpirySecs: 0,
    bondYieldValue: "",
    lx: 189.5,
    expiresAtSecs: 300,
    instrumentType: "equity",
    algoParams: { strategy: "LIMIT" },
    ...overrides,
  };
}

describe("buildTrade", () => {
  it("builds an equity trade with the supplied algo params", () => {
    const trade = buildTrade(
      inputs({ algoParams: { strategy: "TWAP", numSlices: 10, participationCap: 25 } })
    );
    expect(trade).toEqual({
      asset: "AAPL",
      side: "BUY",
      quantity: 100,
      limitPrice: 189.5,
      expiresAt: 300,
      algoParams: { strategy: "TWAP", numSlices: 10, participationCap: 25 },
    });
  });

  it("adds instrumentType=fx when underlying asset is fx", () => {
    const trade = buildTrade(inputs({ instrumentType: "fx" }));
    expect(trade.instrumentType).toBe("fx");
  });

  it("adds instrumentType=commodity for commodity orders", () => {
    const trade = buildTrade(inputs({ instrumentType: "commodity" }));
    expect(trade.instrumentType).toBe("commodity");
  });

  it("omits instrumentType for plain equity", () => {
    const trade = buildTrade(inputs({ instrumentType: "equity" }));
    expect(trade.instrumentType).toBeUndefined();
  });

  it("builds an option trade with LIMIT algo and a 300s expiry", () => {
    const trade = buildTrade(
      inputs({
        isOptions: true,
        optionType: "put",
        optionStrikeNum: 200,
        optionExpirySecs: 30 * 86400,
        optionPremium: 5.25,
      })
    );
    expect(trade).toMatchObject({
      asset: "AAPL",
      side: "BUY",
      quantity: 100,
      expiresAt: 300,
      algoParams: { strategy: "LIMIT" },
      instrumentType: "option",
      optionSpec: {
        optionType: "put",
        strike: 200,
        expirySecs: 30 * 86400,
        premium: 5.25,
      },
    });
  });

  it("builds a bond trade with yield from input when supplied", () => {
    const trade = buildTrade(
      inputs({
        isBond: true,
        selectedBondDef: UST10Y,
        bondYieldValue: "5.0",
        bondPrice: 98.7,
      })
    );
    expect(trade).toMatchObject({
      asset: "US10Y",
      limitPrice: 98.7,
      instrumentType: "bond",
      bondSpec: {
        isin: "US10Y",
        yieldAtOrder: 0.05,
      },
    });
  });

  it("falls back to bond initialYield when yield input is empty/zero", () => {
    const trade = buildTrade(
      inputs({
        isBond: true,
        selectedBondDef: UST10Y,
        bondYieldValue: "0",
        bondPrice: 100,
      })
    );
    expect((trade as { bondSpec: { yieldAtOrder: number } }).bondSpec.yieldAtOrder).toBeCloseTo(
      0.045,
      4
    );
  });
});
