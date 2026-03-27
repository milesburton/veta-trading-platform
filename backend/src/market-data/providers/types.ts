/**
 * Provider interface for market data sources.
 */

export interface CachedQuote {
  symbol: string;
  price: number;
  volume: number;
  latestTradingDay: string;
  fetchedAt: number;
  stale: boolean;
}

export interface ProviderDef {
  id: string;
  label: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
  /** Whether this provider supports toggle (pause/resume) */
  togglable: boolean;
  /** Whether this provider can handle the given symbol */
  supportsSymbol(symbol: string): boolean;
  /** Fetch a fresh quote. Returns null on failure. */
  fetchQuote(symbol: string, journalUrl: string): Promise<CachedQuote | null>;
  /** Optional: seed historical candles to journal on startup */
  seedHistory?(symbol: string, journalUrl: string): Promise<void>;
}
