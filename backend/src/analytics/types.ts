/**
 * Shared TypeScript types for the Analytics service.
 */

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

export type SignalStrength = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

/** @deprecated Use string[] in Recommendation.reasons — kept only for type compat. */
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

export interface SignalInput {
  score: number;          // -1 to +1 from intelligence pipeline
  direction: "long" | "short" | "neutral";
  confidence: number;     // 0 to 1
  factors: { name: string; weight: number; contribution: number }[];
}

export interface Recommendation {
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  price: number;
  score: number;                // -100 to +100
  signalStrength: SignalStrength;
  reasons: string[];            // rule codes + factor names
  greeks: Greeks;
  impliedVol: number;
  // Signal-driven scoring fields (undefined when scoringMode is "rule-based")
  scoringMode: "rule-based" | "signal-driven";
  signalScore?: number;
  signalConfidence?: number;
  signalDirection?: string;
  topFactors?: { name: string; contribution: number }[];
}

export interface RecommendationRequest {
  symbol: string;
  riskFreeRate?: number;
  strikes?: number[];       // if omitted, auto-generate ±5 strikes around ATM
  expiries?: number[];      // seconds to expiry; if omitted, [7, 14, 30, 60, 90] days
  signal?: SignalInput;     // optional: include for signal-driven scoring
}

export interface RecommendationResponse {
  symbol: string;
  spotPrice: number;
  impliedVol: number;
  recommendations: Recommendation[];
  computedAt: number;
}

export interface VolProfileSample {
  ts: number;   // unix ms (candle timestamp)
  vol: number;  // annualised EWMA vol at this bar
}

export interface VolProfileResponse {
  symbol: string;
  spotPrice: number | null;
  ewmaVol: number;      // current EWMA vol (last bar)
  rollingVol: number;   // simple rolling std-dev vol (for reference)
  series: VolProfileSample[];
  computedAt: number;
}

export interface BondPriceRequest {
  face?: number;           // face value, default 1000
  couponRate: number;      // annual coupon rate e.g. 0.05
  periodsPerYear?: number; // coupon frequency, default 2 (semi-annual)
  totalPeriods: number;    // total coupon periods e.g. 20 = 10yr semi-annual
  yieldAnnual: number;     // current yield (continuous compounding)
}

export interface BondPriceResponse {
  price: number;
  yieldAnnual: number;
  modifiedDuration: number;
  convexity: number;
  dv01: number;            // dollar value of 1bp
  cashFlows: { t: number; cf: number; pv: number }[];
  computedAt: number;
}

export interface NelsonSiegelParams {
  beta0: number;   // long-run level
  beta1: number;   // slope
  beta2: number;   // curvature
  lambda: number;  // time constant (years)
}

export interface YieldCurvePoint {
  tenorYears: number;
  tenorLabel: string;
  spotRate: number;
}

export interface ForwardRate {
  fromYears: number;
  toYears: number;
  label: string;
  rate: number;
}

export interface YieldCurveRequest {
  params?: Partial<NelsonSiegelParams>;
}

export interface YieldCurveResponse {
  curve: YieldCurvePoint[];
  forwardRates: ForwardRate[];
  computedAt: number;
}

export interface PriceFanStep {
  step: number;
  tSecs: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface PriceFanResponse {
  symbol: string;
  spotPrice: number;
  impliedVol: number;
  riskFreeRate: number;
  steps: PriceFanStep[];
  computedAt: number;
}

export interface GreeksSurfacePoint {
  strike: number;
  moneyness: number;    // K / S
  callDelta: number;
  gamma: number;
  theta: number;
  vega: number;
  callPrice: number;
}

export interface GreeksSurfaceResponse {
  symbol: string;
  spotPrice: number;
  impliedVol: number;
  expirySecs: number;
  strikes: GreeksSurfacePoint[];
  computedAt: number;
}
