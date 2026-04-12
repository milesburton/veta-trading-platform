export type TestTradingStyle =
  | "high_touch"
  | "low_touch"
  | "fi_voice"
  | "fx_electronic"
  | "commodities_voice"
  | "derivatives_high_touch"
  | "derivatives_low_touch"
  | "oversight";

export interface AuthUser {
  id: string;
  name: string;
  role:
    | "trader"
    | "desk-head"
    | "risk-manager"
    | "admin"
    | "compliance"
    | "sales"
    | "external-client"
    | "viewer";
  avatar_emoji: string;
}

export interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
  allowed_desks: string[];
  dark_pool_access: boolean;
  trading_style?: TestTradingStyle;
  primary_desk?: string;
}

export interface AssetDef {
  symbol: string;
  name: string;
  sector: string;
  exchange?: string;
  marketCapB?: number;
  beta?: number;
  dividendYield?: number;
  peRatio?: number;
  lotSize?: number;
}

export const DEFAULT_TRADER: AuthUser = {
  id: "trader-1",
  name: "Alice Chen",
  role: "trader",
  avatar_emoji: "AL",
};

export const ALGO_TRADER: AuthUser = {
  id: "trader-2",
  name: "Bob Martinez",
  role: "trader",
  avatar_emoji: "BM",
};

export const FI_TRADER: AuthUser = {
  id: "trader-3",
  name: "Carol Davis",
  role: "trader",
  avatar_emoji: "CD",
};

export const RESEARCH_ANALYST: AuthUser = {
  id: "trader-4",
  name: "David Kim",
  role: "trader",
  avatar_emoji: "DK",
};

export const DEFAULT_ADMIN: AuthUser = {
  id: "admin-1",
  name: "Admin User",
  role: "admin",
  avatar_emoji: "AD",
};

export const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
  trading_style: "high_touch",
  primary_desk: "equity-cash",
};

export const ALGO_TRADER_LIMITS: TradingLimits = {
  max_order_qty: 100_000,
  max_daily_notional: 50_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE"],
  allowed_desks: ["equity"],
  dark_pool_access: true,
  trading_style: "low_touch",
  primary_desk: "equity-cash",
};

export const FI_TRADER_LIMITS: TradingLimits = {
  max_order_qty: 1_000,
  max_daily_notional: 100_000_000,
  allowed_strategies: ["LIMIT"],
  allowed_desks: ["fi"],
  dark_pool_access: false,
  trading_style: "fi_voice",
  primary_desk: "fi-govies",
};

export const ANALYST_LIMITS: TradingLimits = {
  max_order_qty: 0,
  max_daily_notional: 0,
  allowed_strategies: [],
  allowed_desks: [],
  dark_pool_access: false,
};

export const DEFAULT_ASSETS: AssetDef[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 3000, beta: 1.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2800, beta: 0.9 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1800, beta: 1.1 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2200, beta: 1.8 },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1900, beta: 1.3 },
];
