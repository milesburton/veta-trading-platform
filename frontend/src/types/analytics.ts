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

export interface SignalInput {
  score: number;
  direction: "long" | "short" | "neutral";
  confidence: number;
  factors: { name: string; weight: number; contribution: number }[];
}

export interface Recommendation {
  optionType: OptionType;
  strike: number;
  expirySecs: number;
  price: number;
  score: number;
  signalStrength: SignalStrength;
  reasons: string[];
  greeks: Greeks;
  impliedVol: number;
  scoringMode: "rule-based" | "signal-driven";
  signalScore?: number;
  signalConfidence?: number;
  signalDirection?: string;
  topFactors?: { name: string; contribution: number }[];
}

export interface RecommendationRequest {
  symbol: string;
  riskFreeRate?: number;
  strikes?: number[];
  expiries?: number[];
  signal?: SignalInput;
}

export interface RecommendationResponse {
  symbol: string;
  spotPrice: number;
  impliedVol: number;
  recommendations: Recommendation[];
  computedAt: number;
}

export interface VolProfileSample {
  ts: number;
  vol: number;
}

export interface VolProfileResponse {
  symbol: string;
  spotPrice: number | null;
  ewmaVol: number;
  rollingVol: number;
  series: VolProfileSample[];
  computedAt: number;
}

export interface BondPriceRequest {
  face?: number;
  couponRate: number;
  periodsPerYear?: number;
  totalPeriods: number;
  yieldAnnual: number;
}

export interface BondPriceResponse {
  price: number;
  yieldAnnual: number;
  modifiedDuration: number;
  convexity: number;
  dv01: number;
  cashFlows: { t: number; cf: number; pv: number }[];
  computedAt: number;
}

export interface NelsonSiegelParams {
  beta0: number;
  beta1: number;
  beta2: number;
  lambda: number;
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
  moneyness: number;
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

export interface SpreadAnalysisRequest {
  couponRate: number;
  totalPeriods: number;
  periodsPerYear?: number;
  yieldAnnual: number;
  face?: number;
  nsParams?: Partial<NelsonSiegelParams>;
}

export interface SpreadAnalysisResponse {
  bondYield: number;
  tenorYears: number;
  govSpotRate: number;
  gSpread: number; // basis points
  zSpread: number; // basis points
  oas: number; // basis points
  computedAt: number;
}

export interface BondPosition {
  faceValue: number;
  couponRate: number;
  totalPeriods: number;
  periodsPerYear?: number;
  yieldAnnual: number;
  quantity: number;
}

export interface DurationLadderResponse {
  positions: {
    bondIndex: number;
    totalDv01: number;
    modifiedDuration: number;
    contributions: {
      bondIndex: number;
      tenorLabel: string;
      dv01Contribution: number;
    }[];
  }[];
  buckets: {
    tenorLabel: string;
    tenorYears: number;
    netDv01: number;
  }[];
  totalPortfolioDv01: number;
  computedAt: number;
}

export interface VolSurfacePoint {
  expirySecs: number;
  expiryLabel: string;
  moneyness: number;
  strike: number;
  impliedVol: number;
}

export interface VolSurfaceResponse {
  symbol: string;
  spotPrice: number;
  atTheMoneyVol: number;
  expiries: number[];
  moneynesses: number[];
  surface: VolSurfacePoint[];
  computedAt: number;
}
