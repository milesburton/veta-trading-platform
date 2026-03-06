/**
 * Analytics types — mirrored from backend/src/analytics/types.ts
 */

export type OptionType = "call" | "put";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionQuoteRequest {
  symbol: string;
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  riskFreeRate?: number;
}

export interface OptionQuoteResponse {
  symbol: string;
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  spotPrice: number;
  impliedVol: number;
  price: number;
  greeks: Greeks;
  computedAt: number;
}

export interface ScenarioCell {
  spotPct: number;
  volPct: number;
  optionPrice: number;
  pnl: number;
  pnlPct: number;
  p5: number;
  p25: number;
  mean: number;
  p75: number;
  p95: number;
}

export interface ScenarioRequest {
  symbol: string;
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  riskFreeRate?: number;
  spotShocks: number[];
  volShocks: number[];
  timeDays?: number;
  paths?: number;
}

export interface ScenarioResponse {
  symbol: string;
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  spotPrice: number;
  impliedVol: number;
  baselinePrice: number;
  spotShocks: number[];
  volShocks: number[];
  cells: ScenarioCell[][];
  computedAt: number;
}

export type SignalStrength = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

export type SignalReason =
  | "DEEP_ITM"
  | "DEEP_OTM"
  | "ATM_HIGH_VOL"
  | "LOW_TIME_VALUE"
  | "HIGH_THETA_DECAY"
  | "POSITIVE_DELTA_TREND"
  | "NEGATIVE_DELTA_TREND"
  | "VOL_PREMIUM_ELEVATED"
  | "VOL_DISCOUNT"
  | "NEAR_EXPIRY_RISK"
  | "WIDE_BID_ASK_PROXY"
  | "FAVOURABLE_RISK_REWARD";

export interface Recommendation {
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  price: number;
  score: number;
  signalStrength: SignalStrength;
  reasons: SignalReason[];
  greeks: Greeks;
  impliedVol: number;
}

export interface RecommendationRequest {
  symbol: string;
  riskFreeRate?: number;
  strikes?: number[];
  expiries?: number[];
}

export interface RecommendationResponse {
  symbol: string;
  spotPrice: number;
  impliedVol: number;
  recommendations: Recommendation[];
  computedAt: number;
}
