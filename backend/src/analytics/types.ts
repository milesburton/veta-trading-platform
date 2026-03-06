/**
 * Shared TypeScript types for the Analytics service.
 */

// ── Option Pricing ────────────────────────────────────────────────────────────

export type OptionType = "call" | "put";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;  // per-day decay
  vega: number;   // per 1% vol move
  rho: number;    // per 1% rate move
}

export interface OptionQuoteRequest {
  symbol: string;
  optionType: OptionType;
  strike: number;          // option strike price
  expirySecs: number;      // seconds to expiry
  riskFreeRate?: number;   // annual, default 0.05
}

export interface OptionQuoteResponse {
  symbol: string;
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  spotPrice: number;
  impliedVol: number;      // annualised σ used in calculation
  price: number;           // theoretical option price
  greeks: Greeks;
  computedAt: number;      // unix ms
}

// ── Scenario Analysis ─────────────────────────────────────────────────────────

export interface ScenarioShock {
  spotPct: number;    // e.g. -0.10 = -10%
  volPct: number;     // e.g.  0.20 = vol +20pp
  timeDays: number;   // e.g. 7 = 7 days elapsed
}

export interface ScenarioCell {
  spotPct: number;
  volPct: number;
  optionPrice: number;
  pnl: number;                // vs baseline price (no shock)
  pnlPct: number;
  // Monte Carlo distribution for this cell
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
  spotShocks: number[];   // e.g. [-0.20, -0.10, 0, 0.10, 0.20]
  volShocks: number[];    // e.g. [-0.20, -0.10, 0, 0.10, 0.20]
  timeDays?: number;      // fixed time elapsed for all cells (default 0)
  paths?: number;         // Monte Carlo paths per cell (default 1000)
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
  cells: ScenarioCell[][];   // [spotShockIndex][volShockIndex]
  computedAt: number;
}

// ── Trade Recommendations ─────────────────────────────────────────────────────

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
  score: number;            // -100 to +100
  signalStrength: SignalStrength;
  reasons: SignalReason[];
  greeks: Greeks;
  impliedVol: number;
}

export interface RecommendationRequest {
  symbol: string;
  riskFreeRate?: number;
  strikes?: number[];       // if omitted, auto-generate ±5 strikes around ATM
  expiries?: number[];      // seconds to expiry; if omitted, [7, 14, 30, 60, 90] days
}

export interface RecommendationResponse {
  symbol: string;
  spotPrice: number;
  impliedVol: number;
  recommendations: Recommendation[];
  computedAt: number;
}
