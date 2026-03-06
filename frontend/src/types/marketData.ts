/**
 * Market data types — mirrored from backend/src/market-data/market-data-service.ts
 */

export interface DataSource {
  id: "synthetic" | "alpha-vantage";
  label: string;
  description: string;
  enabled: boolean;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
  /** false when the feed has been globally paused by an admin */
  active: boolean;
}

export interface CachedQuote {
  symbol: string;
  price: number;
  volume: number;
  latestTradingDay: string;
  fetchedAt: number;
  stale: boolean;
}

export interface OverridesResponse {
  overrides: Record<string, string>;
}
