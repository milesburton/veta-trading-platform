import type { Strategy } from "../../types";

export type VenueMIC =
  | "XNAS"
  | "XNYS"
  | "ARCX"
  | "BATS"
  | "EDGX"
  | "IEX"
  | "MEMX"
  | "DARK1"
  | "RFQ"
  | "EBS"
  | "XCME";

export interface VenueCapabilities {
  mic: VenueMIC;
  name: string;
  supportedStrategies: Strategy[];
  supportsMarketOrders: boolean;
  supportsLimitOrders: boolean;
  supportsPegged: boolean;
  supportsIceberg: boolean;
  isDark: boolean;
  supportsAuction: boolean;
  minQuantity?: number;
  minNotional?: number;
}

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

export function getVenueCapabilities(mic: VenueMIC): VenueCapabilities | undefined {
  return VENUE_REGISTRY[mic];
}

export const LIT_EQUITY_VENUES: VenueMIC[] = [
  "XNAS",
  "XNYS",
  "ARCX",
  "BATS",
  "EDGX",
  "IEX",
  "MEMX",
];
