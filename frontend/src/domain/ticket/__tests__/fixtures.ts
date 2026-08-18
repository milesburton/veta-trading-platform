import type { SessionState } from "@veta/frontend/domain/market/marketSession";
import type { TicketContext } from "@veta/frontend/domain/ticket/ticketTypes";
import type { TradingLimits } from "@veta/frontend/store/authSlice";

export const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};

export const HALTED_SESSION: SessionState = {
  phase: "HALTED",
  allowsOrderEntry: false,
  allowsAmend: false,
  allowsCancel: true,
  supportedStrategies: [],
  phaseLabel: "Trading Halted",
};

export const AUCTION_SESSION: SessionState = {
  phase: "OPENING_AUCTION",
  allowsOrderEntry: true,
  allowsAmend: true,
  allowsCancel: true,
  supportedStrategies: ["LIMIT"],
  phaseLabel: "Opening Auction",
};

export const VALID_OPTION = {
  optionType: "call" as const,
  strike: 150,
  expirySecs: 86_400,
  hasQuote: true,
  isFetching: false,
};

export const VALID_BOND = {
  symbol: "US10Y",
  yieldPct: 4.5,
  hasQuote: true,
  isFetching: false,
  hasBondDef: true,
};

export const CONTINUOUS_SESSION: SessionState = {
  phase: "CONTINUOUS",
  allowsOrderEntry: true,
  allowsAmend: true,
  allowsCancel: true,
  supportedStrategies: [
    "LIMIT",
    "TWAP",
    "POV",
    "VWAP",
    "ICEBERG",
    "SNIPER",
    "ARRIVAL_PRICE",
    "IS",
    "MOMENTUM",
  ],
  phaseLabel: "Continuous Trading",
};

export function makeCtx(overrides: Partial<TicketContext> = {}): TicketContext {
  return {
    userId: "user-1",
    userRole: "trader",
    limits: {
      max_order_qty: 10_000,
      max_daily_notional: 1_000_000,
      allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
      allowed_desks: ["equity"],
      dark_pool_access: false,
    },
    killBlocks: [],
    instrument: {
      instrumentType: "equity",
      symbol: "AAPL",
      lotSize: 1,
      currentPrice: 189.5,
      orderBookMid: 189.45,
    },
    draft: {
      side: "BUY",
      quantity: 100,
      limitPrice: 189.5,
      strategy: "LIMIT",
      expiresAtSecs: 300,
      tif: "DAY",
    },
    option: {
      optionType: "call",
      strike: 0,
      expirySecs: 0,
      hasQuote: false,
      isFetching: false,
    },
    bond: {
      symbol: "",
      yieldPct: 0,
      hasQuote: false,
      isFetching: false,
      hasBondDef: false,
    },
    session: CONTINUOUS_SESSION,
    dirtyFields: new Set(),
    ...overrides,
  };
}
