/**
 * Shared domain types for the Market Intelligence pipeline.
 *
 * Flow:
 *   news-aggregator   → news.events.normalised  (NewsEvent)
 *   market-data-adapters → market.external.events (MarketAdapterEvent)
 *   feature-engine    → market.features          (FeatureVector)
 *   signal-engine     → market.signals           (Signal)
 *   recommendation-engine → market.recommendations (TradeRecommendation)
 */

export interface NewsEvent {
  id: string;
  source: string;
  headline: string;
  body?: string;
  tickers: string[];
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number; // -1.0 to +1.0 (normalised)
  relevanceScore: number; // 0.0 to 1.0
  publishedAt: number; // ms epoch
  ts: number;
}

export interface MarketAdapterEvent {
  id: string;
  type: "earnings" | "dividend" | "economic" | "split";
  ticker?: string; // undefined for macro events
  headline: string;
  scheduledAt: number; // ms epoch
  impact: "high" | "medium" | "low";
  ts: number;
}

export interface FeatureVector {
  symbol: string;
  ts: number;
  momentum: number; // (price - price20TicksAgo) / price20TicksAgo
  relativeVolume: number; // currentVol / rolling20TickAvgVol
  realisedVol: number; // annualised vol from 120 1-min candles
  sectorRelativeStrength: number; // symbol return vs sector avg over 20 ticks
  eventScore: number; // sum of impact weights for events in next 7 days
  newsVelocity: number; // news count in last 60s
  sentimentDelta: number; // sentimentScore[now] - sentimentScore[60s ago]
}

export type FeatureName = keyof Omit<FeatureVector, "symbol" | "ts">;

export interface SignalFactor {
  name: FeatureName;
  weight: number;
  contribution: number; // weight × normalised feature value (for explainability)
}

export interface Signal {
  symbol: string;
  score: number; // -1.0 to +1.0
  direction: "long" | "short" | "neutral";
  confidence: number; // 0.0 to 1.0
  factors: SignalFactor[];
  ts: number;
}

export interface ScenarioShock {
  factor: FeatureName;
  delta: number;
}

export interface TradeRecommendation {
  symbol: string;
  action: "buy" | "sell" | "hold";
  suggestedQty: number;
  rationale: string;
  signalScore: number;
  confidence: number;
  ts: number;
}
