import type { TradingLimits } from "../store/authSlice.ts";
import type { AssetDef, MarketPrices, OhlcCandle, OrderRecord, PriceHistory } from "../types.ts";

// ── Assets ─────────────────────────────────────────────────────────────────

export const MOCK_ASSETS: AssetDef[] = [
  {
    symbol: "AAPL",
    initialPrice: 189,
    volatility: 0.018,
    sector: "Technology",
    marketCapB: 2940,
    beta: 1.21,
    dividendYield: 0.0051,
    peRatio: 29.4,
    exchange: "XNAS",
    dailyVolume: 58_000_000,
    assetClass: "equity",
  },
  {
    symbol: "MSFT",
    initialPrice: 415,
    volatility: 0.016,
    sector: "Technology",
    marketCapB: 3080,
    beta: 0.89,
    dividendYield: 0.0072,
    peRatio: 35.1,
    exchange: "XNAS",
    dailyVolume: 22_000_000,
    assetClass: "equity",
  },
  {
    symbol: "AMZN",
    initialPrice: 185,
    volatility: 0.022,
    sector: "Consumer Discretionary",
    marketCapB: 1920,
    beta: 1.14,
    peRatio: 44.2,
    exchange: "XNAS",
    dailyVolume: 40_000_000,
    assetClass: "equity",
  },
  {
    symbol: "NVDA",
    initialPrice: 875,
    volatility: 0.035,
    sector: "Technology",
    marketCapB: 2150,
    beta: 1.65,
    peRatio: 62.8,
    exchange: "XNAS",
    dailyVolume: 45_000_000,
    assetClass: "equity",
  },
  {
    symbol: "GOOGL",
    initialPrice: 175,
    volatility: 0.019,
    sector: "Communication Services",
    marketCapB: 2190,
    beta: 1.05,
    peRatio: 25.7,
    exchange: "XNAS",
    dailyVolume: 25_000_000,
    assetClass: "equity",
  },
  {
    symbol: "META",
    initialPrice: 527,
    volatility: 0.025,
    sector: "Communication Services",
    marketCapB: 1340,
    beta: 1.28,
    peRatio: 27.3,
    exchange: "XNAS",
    dailyVolume: 18_000_000,
    assetClass: "equity",
  },
  {
    symbol: "TSLA",
    initialPrice: 248,
    volatility: 0.04,
    sector: "Consumer Discretionary",
    marketCapB: 790,
    beta: 1.89,
    peRatio: 55.6,
    exchange: "XNAS",
    dailyVolume: 120_000_000,
    assetClass: "equity",
  },
  {
    symbol: "JPM",
    initialPrice: 198,
    volatility: 0.02,
    sector: "Finance",
    marketCapB: 570,
    beta: 1.08,
    dividendYield: 0.023,
    peRatio: 11.2,
    exchange: "XNYS",
    dailyVolume: 10_000_000,
    assetClass: "equity",
  },
  // FX pairs
  {
    symbol: "EUR/USD",
    initialPrice: 1.085,
    volatility: 0.006,
    sector: "FX",
    exchange: "FX",
    assetClass: "fx",
  },
  {
    symbol: "GBP/USD",
    initialPrice: 1.268,
    volatility: 0.008,
    sector: "FX",
    exchange: "FX",
    assetClass: "fx",
  },
  // Commodity futures
  {
    symbol: "CL1!",
    initialPrice: 78.5,
    volatility: 0.028,
    sector: "Commodities",
    exchange: "NYMEX",
    assetClass: "commodity",
  },
  {
    symbol: "GC1!",
    initialPrice: 2420,
    volatility: 0.012,
    sector: "Commodities",
    exchange: "COMEX",
    assetClass: "commodity",
  },
];

// ── Prices ─────────────────────────────────────────────────────────────────

export const MOCK_PRICES: MarketPrices = {
  AAPL: 191.42,
  MSFT: 418.67,
  AMZN: 183.15,
  NVDA: 882.3,
  GOOGL: 176.88,
  META: 531.4,
  TSLA: 243.55,
  JPM: 199.72,
  "EUR/USD": 1.0862,
  "GBP/USD": 1.2705,
  "CL1!": 79.12,
  "GC1!": 2437.5,
};

export const MOCK_SESSION_OPEN: MarketPrices = {
  AAPL: 188.9,
  MSFT: 415.0,
  AMZN: 186.0,
  NVDA: 870.0,
  GOOGL: 174.5,
  META: 525.0,
  TSLA: 250.0,
  JPM: 197.5,
  "EUR/USD": 1.085,
  "GBP/USD": 1.268,
  "CL1!": 78.5,
  "GC1!": 2420.0,
};

// ── Price history (60 points each) ─────────────────────────────────────────

function genHistory(base: number, volatility: number, length = 60): number[] {
  const out: number[] = [];
  let p = base;
  // deterministic pseudo-random using linear congruential generator
  let seed = Math.floor(base * 100);
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const rand = (seed / 0x7fffffff) * 2 - 1;
    p = Math.max(p * (1 + rand * volatility), 0.0001);
    out.push(Number.parseFloat(p.toFixed(4)));
  }
  return out;
}

export const MOCK_PRICE_HISTORY: PriceHistory = {
  AAPL: genHistory(188.9, 0.018),
  MSFT: genHistory(415.0, 0.016),
  AMZN: genHistory(186.0, 0.022),
  NVDA: genHistory(870.0, 0.035),
  GOOGL: genHistory(174.5, 0.019),
  META: genHistory(525.0, 0.025),
  TSLA: genHistory(250.0, 0.04),
  JPM: genHistory(197.5, 0.02),
  "EUR/USD": genHistory(1.085, 0.006),
  "GBP/USD": genHistory(1.268, 0.008),
  "CL1!": genHistory(78.5, 0.028),
  "GC1!": genHistory(2420.0, 0.012),
};

// ── Orders ─────────────────────────────────────────────────────────────────

const NOW = Date.now();

export const MOCK_ORDERS: OrderRecord[] = [
  {
    id: "ord-0001-aaa",
    submittedAt: NOW - 60_000,
    asset: "AAPL",
    side: "BUY",
    quantity: 500,
    limitPrice: 190.5,
    expiresAt: NOW + 3600_000,
    strategy: "LIMIT",
    status: "pending",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    userId: "alice",
  },
  {
    id: "ord-0002-bbb",
    submittedAt: NOW - 120_000,
    asset: "MSFT",
    side: "BUY",
    quantity: 200,
    limitPrice: 417.0,
    expiresAt: NOW + 3600_000,
    strategy: "TWAP",
    status: "working",
    filled: 80,
    algoParams: { strategy: "TWAP", numSlices: 10, participationCap: 25 },
    children: [],
    userId: "alice",
  },
  {
    id: "ord-0003-ccc",
    submittedAt: NOW - 300_000,
    asset: "NVDA",
    side: "SELL",
    quantity: 150,
    limitPrice: 885.0,
    expiresAt: NOW - 1000,
    strategy: "VWAP",
    status: "filled",
    filled: 150,
    algoParams: { strategy: "VWAP", maxDeviation: 0.5, startOffsetSecs: 0, endOffsetSecs: 300 },
    children: [],
    userId: "alice",
  },
  {
    id: "ord-0004-ddd",
    submittedAt: NOW - 200_000,
    asset: "TSLA",
    side: "BUY",
    quantity: 1000,
    limitPrice: 240.0,
    expiresAt: NOW - 5000,
    strategy: "LIMIT",
    status: "expired",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    userId: "alice",
  },
  {
    id: "ord-0005-eee",
    submittedAt: NOW - 180_000,
    asset: "AMZN",
    side: "SELL",
    quantity: 300,
    limitPrice: 184.0,
    expiresAt: NOW + 1000,
    strategy: "POV",
    status: "rejected",
    filled: 0,
    algoParams: { strategy: "POV", participationRate: 10, minSliceSize: 10, maxSliceSize: 500 },
    children: [],
    userId: "bob",
  },
  {
    id: "ord-0006-fff",
    submittedAt: NOW - 90_000,
    asset: "JPM",
    side: "BUY",
    quantity: 400,
    limitPrice: 198.0,
    expiresAt: NOW + 3600_000,
    strategy: "TWAP",
    status: "cancelled",
    filled: 100,
    algoParams: { strategy: "TWAP", numSlices: 10, participationCap: 25 },
    children: [],
    userId: "alice",
  },
  {
    id: "ord-0007-ggg",
    submittedAt: NOW - 45_000,
    asset: "GOOGL",
    side: "BUY",
    quantity: 250,
    limitPrice: 176.0,
    expiresAt: NOW + 7200_000,
    strategy: "ICEBERG",
    status: "working",
    filled: 100,
    algoParams: { strategy: "ICEBERG", visibleQty: 100 },
    children: [],
    userId: "alice",
  },
  {
    id: "ord-0008-hhh",
    submittedAt: NOW - 30_000,
    asset: "META",
    side: "SELL",
    quantity: 100,
    limitPrice: 533.0,
    expiresAt: NOW + 7200_000,
    strategy: "SNIPER",
    status: "working",
    filled: 20,
    algoParams: { strategy: "SNIPER", aggressionPct: 80, maxVenues: 2 },
    children: [],
    userId: "bob",
  },
];

// ── Candles ─────────────────────────────────────────────────────────────────

export const MOCK_CANDLES: OhlcCandle[] = (() => {
  const candles: OhlcCandle[] = [];
  const MINUTE = 60_000;
  const start = NOW - 100 * MINUTE;
  let price = 188.5;
  let seed = 12345;
  for (let i = 0; i < 100; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const rand = (seed / 0x7fffffff) * 2 - 1;
    const open = price;
    price = Math.max(price * (1 + rand * 0.003), 1);
    const high = Math.max(open, price) * (1 + ((seed & 0xf) / 0xf) * 0.002);
    const low = Math.min(open, price) * (1 - ((seed & 0xf) / 0xf) * 0.002);
    candles.push({
      time: start + i * MINUTE,
      open: Number.parseFloat(open.toFixed(2)),
      high: Number.parseFloat(high.toFixed(2)),
      low: Number.parseFloat(low.toFixed(2)),
      close: Number.parseFloat(price.toFixed(2)),
      volume: Math.floor(5000 + ((seed & 0xff) / 0xff) * 50_000),
    });
  }
  return candles;
})();

// ── Trading limits ──────────────────────────────────────────────────────────

export const MOCK_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 5_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER"],
  allowed_desks: ["equity", "fx"],
  dark_pool_access: false,
};

export const MOCK_LIMITS_FX: TradingLimits = {
  max_order_qty: 50_000_000,
  max_daily_notional: 100_000_000,
  allowed_strategies: ["LIMIT", "TWAP"],
  allowed_desks: ["fx", "equity"],
  dark_pool_access: false,
};

export const MOCK_LIMITS_TIGHT: TradingLimits = {
  max_order_qty: 100,
  max_daily_notional: 20_000,
  allowed_strategies: ["LIMIT"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};
