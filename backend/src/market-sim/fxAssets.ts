import type { AssetDef } from "./sp500Assets.ts";
import { GENERATED_FX, GENERATED_FX_NAMES } from "./generatedFx.ts";

/** Simulated ISIN: FX + padded symbol + check digit 0. */
function fxIsin(symbol: string): string {
  const padded = symbol
    .replace(/[^A-Z0-9]/g, "")
    .padEnd(9, "0")
    .slice(0, 9);
  return `FX${padded}0`;
}

// FX pairs: price = units of quote currency per 1 unit of base currency.
// Volatility = approximate daily σ for GBM (FX is lower than equities).
// dailyVolume = approximate daily notional in millions of units of base (indicative).
// sector = "FX" — used by heatmap grouping.
// lotSize = 1000 (standard FX "lot" expressed in base units for display).
// exchange = "XCME" (CME FX futures venue; spot FX is OTC but we use a single MIC).

const FX_NAMES: Record<string, string> = {
  "EUR/USD": "Euro / US Dollar",
  "GBP/USD": "British Pound / US Dollar",
  "USD/JPY": "US Dollar / Japanese Yen",
  "AUD/USD": "Australian Dollar / US Dollar",
  "USD/CAD": "US Dollar / Canadian Dollar",
  "USD/CHF": "US Dollar / Swiss Franc",
  "NZD/USD": "New Zealand Dollar / US Dollar",
  "EUR/GBP": "Euro / British Pound",
  "EUR/JPY": "Euro / Japanese Yen",
};

export const CURATED_FX_SEEDS: Omit<
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
    symbol: "EUR/USD",
    initialPrice: 1.085,
    volatility: 0.0045,
    sector: "FX",
    dailyVolume: 800_000_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1_000,
  },
  {
    symbol: "GBP/USD",
    initialPrice: 1.268,
    volatility: 0.0055,
    sector: "FX",
    dailyVolume: 400_000_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1_000,
  },
  {
    symbol: "USD/JPY",
    initialPrice: 145.5,
    volatility: 0.004,
    sector: "FX",
    dailyVolume: 600_000_000,
    exchange: "XCME",
    currency: "JPY",
    lotSize: 1_000,
  },
  {
    symbol: "AUD/USD",
    initialPrice: 0.652,
    volatility: 0.006,
    sector: "FX",
    dailyVolume: 200_000_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1_000,
  },
  {
    symbol: "USD/CAD",
    initialPrice: 1.368,
    volatility: 0.0042,
    sector: "FX",
    dailyVolume: 150_000_000,
    exchange: "XCME",
    currency: "CAD",
    lotSize: 1_000,
  },
  {
    symbol: "NZD/USD",
    initialPrice: 0.605,
    volatility: 0.0065,
    sector: "FX",
    dailyVolume: 80_000_000,
    exchange: "XCME",
    currency: "USD",
    lotSize: 1_000,
  },
  {
    symbol: "EUR/GBP",
    initialPrice: 0.856,
    volatility: 0.0038,
    sector: "FX",
    dailyVolume: 100_000_000,
    exchange: "XCME",
    currency: "GBP",
    lotSize: 1_000,
  },
  {
    symbol: "USD/CHF",
    initialPrice: 0.885,
    volatility: 0.0042,
    sector: "FX",
    dailyVolume: 120_000_000,
    exchange: "XCME",
    currency: "CHF",
    lotSize: 1_000,
  },
];

export type RawFxSeed = {
  symbol: string;
  initialPrice: number;
  volatility: number;
  dailyVolume: number;
};

function quoteCurrency(symbol: string): AssetDef["currency"] {
  const [, quote] = symbol.split("/");
  return (quote ?? "USD") as AssetDef["currency"];
}

const _GENERATED_RAW_FX: Omit<
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
>[] = GENERATED_FX.map((raw) => ({
  symbol: raw.symbol,
  initialPrice: raw.initialPrice,
  volatility: raw.volatility,
  sector: "FX",
  dailyVolume: raw.dailyVolume,
  exchange: "XCME" as const,
  currency: quoteCurrency(raw.symbol),
  lotSize: 1_000,
}));

export const FX_ASSETS: AssetDef[] = [...CURATED_FX_SEEDS, ..._GENERATED_RAW_FX].map((raw) => ({
  ...raw,
  assetClass: "fx" as const,
  marketCapB: 0,
  beta: 0.0,
  dividendYield: 0.0,
  peRatio: 0.0,
  float: 1.0,
  isin: fxIsin(raw.symbol),
  ric: `${raw.symbol.replace("/", "")}=X`,
  bbgTicker: `${raw.symbol.replace("/", "")} Curncy`,
  name: FX_NAMES[raw.symbol] ?? GENERATED_FX_NAMES[raw.symbol] ?? raw.symbol,
}));

export const FX_ASSET_MAP = new Map<string, AssetDef>(FX_ASSETS.map((a) => [a.symbol, a]));
