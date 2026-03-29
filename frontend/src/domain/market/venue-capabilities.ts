// ---------------------------------------------------------------------------
// Venue Capability Model
// ---------------------------------------------------------------------------
// Describes what each execution venue supports. The rule engine uses this
// to constrain order types, routing, and quantity requirements.
// ---------------------------------------------------------------------------

import type { Strategy } from "../../types";

/**
 * Market Identifier Code — the 7 SOR venues from our execution layer,
 * plus special routing destinations.
 */
export type VenueMIC =
  | "XNAS" // Nasdaq
  | "XNYS" // NYSE
  | "ARCX" // Cboe/ARCA
  | "BATS" // Cboe/BZX
  | "EDGX" // Cboe EDGX
  | "IEX" // IEX
  | "MEMX" // Members Exchange
  | "DARK1" // Dark pool (internal)
  | "RFQ" // Request for Quote (bonds)
  | "EBS" // EBS (FX)
  | "XCME"; // CME (commodities/futures)

export interface VenueCapabilities {
  mic: VenueMIC;
  name: string;

  /** Which strategies this venue accepts. */
  supportedStrategies: Strategy[];

  /** Does this venue support market orders (price = 0)? */
  supportsMarketOrders: boolean;

  /** Does this venue support limit orders? */
  supportsLimitOrders: boolean;

  /** Does this venue support pegged orders? */
  supportsPegged: boolean;

  /** Does this venue support iceberg orders? */
  supportsIceberg: boolean;

  /** Is this a dark pool? */
  isDark: boolean;

  /** Does this venue participate in auctions? */
  supportsAuction: boolean;

  /** Minimum order quantity, if enforced by the venue. */
  minQuantity?: number;

  /** Minimum notional value, if enforced by the venue. */
  minNotional?: number;
}

// ---------------------------------------------------------------------------
// Static venue registry — explicit TypeScript, not JSON config
// ---------------------------------------------------------------------------

const ALL_LIT_STRATEGIES: Strategy[] = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
];

export const VENUE_REGISTRY: Record<VenueMIC, VenueCapabilities> = {
  XNAS: {
    mic: "XNAS",
    name: "Nasdaq",
    supportedStrategies: ALL_LIT_STRATEGIES,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: true,
    supportsIceberg: true,
    isDark: false,
    supportsAuction: true,
  },
  XNYS: {
    mic: "XNYS",
    name: "NYSE",
    supportedStrategies: ALL_LIT_STRATEGIES,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: true,
    supportsIceberg: true,
    isDark: false,
    supportsAuction: true,
  },
  ARCX: {
    mic: "ARCX",
    name: "Cboe/ARCA",
    supportedStrategies: ALL_LIT_STRATEGIES,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: false,
    supportsIceberg: true,
    isDark: false,
    supportsAuction: true,
  },
  BATS: {
    mic: "BATS",
    name: "Cboe/BZX",
    supportedStrategies: ALL_LIT_STRATEGIES,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: true,
    supportsIceberg: true,
    isDark: false,
    supportsAuction: false,
  },
  EDGX: {
    mic: "EDGX",
    name: "Cboe EDGX",
    supportedStrategies: ALL_LIT_STRATEGIES,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: false,
    supportsIceberg: false,
    isDark: false,
    supportsAuction: false,
  },
  IEX: {
    mic: "IEX",
    name: "IEX",
    supportedStrategies: ["LIMIT", "TWAP", "VWAP", "ARRIVAL_PRICE"],
    supportsMarketOrders: false,
    supportsLimitOrders: true,
    supportsPegged: true,
    supportsIceberg: false,
    isDark: false,
    supportsAuction: false,
  },
  MEMX: {
    mic: "MEMX",
    name: "Members Exchange",
    supportedStrategies: ALL_LIT_STRATEGIES,
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: false,
    supportsIceberg: true,
    isDark: false,
    supportsAuction: false,
  },
  DARK1: {
    mic: "DARK1",
    name: "Internal Dark Pool",
    supportedStrategies: ["LIMIT", "VWAP", "ARRIVAL_PRICE"],
    supportsMarketOrders: false,
    supportsLimitOrders: true,
    supportsPegged: true,
    supportsIceberg: false,
    isDark: true,
    supportsAuction: false,
    minQuantity: 10_000,
  },
  RFQ: {
    mic: "RFQ",
    name: "Request for Quote",
    supportedStrategies: ["LIMIT"],
    supportsMarketOrders: false,
    supportsLimitOrders: true,
    supportsPegged: false,
    supportsIceberg: false,
    isDark: false,
    supportsAuction: false,
  },
  EBS: {
    mic: "EBS",
    name: "EBS (FX)",
    supportedStrategies: ["LIMIT", "TWAP"],
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: false,
    supportsIceberg: false,
    isDark: false,
    supportsAuction: false,
  },
  XCME: {
    mic: "XCME",
    name: "CME",
    supportedStrategies: ["LIMIT", "TWAP", "VWAP"],
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsPegged: false,
    supportsIceberg: true,
    isDark: false,
    supportsAuction: true,
  },
};

/**
 * Look up a venue's capabilities. Returns undefined for unknown MICs
 * (defensive — the rule engine should handle gracefully).
 */
export function getVenueCapabilities(mic: VenueMIC): VenueCapabilities | undefined {
  return VENUE_REGISTRY[mic];
}

/** All lit (non-dark) equity venues available for smart order routing. */
export const LIT_EQUITY_VENUES: VenueMIC[] = [
  "XNAS",
  "XNYS",
  "ARCX",
  "BATS",
  "EDGX",
  "IEX",
  "MEMX",
];
