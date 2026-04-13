import type { AssetDef } from "./sp500Assets.ts";

/** Simulated ISIN: CM + padded symbol + check digit 0. */
function commodityIsin(symbol: string): string {
  const padded = symbol.replace(/[^A-Z0-9]/g, "").padEnd(9, "0").slice(0, 9);
  return `CM${padded}0`;
}

// Commodity futures (front-month continuous contracts).
// Price in USD per standard contract unit (bbl, MMBtu, troy oz, etc.).
// Volatility = approximate daily σ (commodities are higher than FX, lower than speculative equities).
// dailyVolume = approximate daily number of contracts traded.
// lotSize = 1 contract (quantity in the OMS is always integer contracts).
// exchange = CME/NYMEX/CBOT venues mapped to a single MIC per commodity.

const COMMODITY_NAMES: Record<string, string> = {
  "CL1!": "WTI Crude Oil Front Month", "NG1!": "Natural Gas Front Month",
  "GC1!": "Gold Front Month", "SI1!": "Silver Front Month",
  "HG1!": "Copper Front Month", "PL1!": "Platinum Front Month",
  "PA1!": "Palladium Front Month", "ZC1!": "Corn Front Month",
  "ZW1!": "Wheat Front Month", "ZS1!": "Soybeans Front Month",
  "CT1!": "Cotton Front Month", "KC1!": "Coffee Front Month",
  "SB1!": "Sugar Front Month",
};

const _RAW_COMMODITY: Omit<
  AssetDef,
  | "marketCapB"
  | "beta"
  | "dividendYield"
  | "peRatio"
  | "float"
  | "isin"
  | "ric"
  | "bbgTicker"
  | "name"
  | "assetClass"
>[] = [
  {
    symbol: "CL1!",
    initialPrice: 78.50,
    volatility: 0.0220,
    sector: "Commodities/Energy",
    dailyVolume: 450_000,
    exchange: "XNYM",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "NG1!",
    initialPrice: 3.05,
    volatility: 0.0350,
    sector: "Commodities/Energy",
    dailyVolume: 200_000,
    exchange: "XNYM",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "RB1!",
    initialPrice: 2.48,
    volatility: 0.0250,
    sector: "Commodities/Energy",
    dailyVolume: 80_000,
    exchange: "XNYM",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "GC1!",
    initialPrice: 2420.00,
    volatility: 0.0100,
    sector: "Commodities/Metals",
    dailyVolume: 200_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "SI1!",
    initialPrice: 31.20,
    volatility: 0.0180,
    sector: "Commodities/Metals",
    dailyVolume: 100_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "HG1!",
    initialPrice: 4.35,
    volatility: 0.0160,
    sector: "Commodities/Metals",
    dailyVolume: 60_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "ZC1!",
    initialPrice: 3.85,
    volatility: 0.0180,
    sector: "Commodities/Agriculture",
    dailyVolume: 250_000,
    exchange: "XCBT",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "ZW1!",
    initialPrice: 5.20,
    volatility: 0.0200,
    sector: "Commodities/Agriculture",
    dailyVolume: 150_000,
    exchange: "XCBT",
    currency: "USD",
    lotSize: 1,
  },
  {
    symbol: "ZS1!",
    initialPrice: 10.45,
    volatility: 0.0160,
    sector: "Commodities/Agriculture",
    dailyVolume: 200_000,
    exchange: "XCBT",
    currency: "USD",
    lotSize: 1,
  },
];

export const COMMODITY_ASSETS: AssetDef[] = _RAW_COMMODITY.map((raw) => {
  const base = raw.symbol.replace(/\d*!$/, "");
  return {
    ...raw,
    assetClass: "commodity" as const,
    marketCapB: 0,
    beta: 0.0,
    dividendYield: 0.0,
    peRatio: 0.0,
    float: 1.0,
    isin: commodityIsin(raw.symbol),
    ric: `${base}c1`,
    bbgTicker: `${base}1 Comdty`,
    name: COMMODITY_NAMES[raw.symbol] ?? raw.symbol,
  };
});

export const COMMODITY_ASSET_MAP = new Map<string, AssetDef>(
  COMMODITY_ASSETS.map((a) => [a.symbol, a]),
);
