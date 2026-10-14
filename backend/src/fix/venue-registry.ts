// Backend port of frontend/src/domain/market/venue-capabilities.ts's
// VENUE_REGISTRY, scoped to the fields a FIX NewOrderSingle can actually
// express (ExDestination -> venue, OrdType Market/Limit, OrderQty). The
// Deno backend and Vite frontend build separately, so this is a
// duplicated literal kept in sync via a drift-guard test, per the same
// pattern ADR 0003 Phase 1 uses for the trading calendar.

export type RegisteredVenueMIC =
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

export interface FixVenueCapabilities {
  mic: RegisteredVenueMIC;
  name: string;
  supportsMarketOrders: boolean;
  supportsLimitOrders: boolean;
  isDark: boolean;
  minQuantity?: number;
}

export const FIX_VENUE_REGISTRY: Record<RegisteredVenueMIC, FixVenueCapabilities> = {
  XNAS: { mic: "XNAS", name: "Nasdaq", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  XNYS: { mic: "XNYS", name: "NYSE", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  ARCX: { mic: "ARCX", name: "Cboe/ARCA", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  BATS: { mic: "BATS", name: "Cboe/BZX", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  EDGX: { mic: "EDGX", name: "Cboe EDGX", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  IEX: { mic: "IEX", name: "IEX", supportsMarketOrders: false, supportsLimitOrders: true, isDark: false },
  MEMX: { mic: "MEMX", name: "Members Exchange", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  DARK1: {
    mic: "DARK1",
    name: "Internal Dark Pool",
    supportsMarketOrders: false,
    supportsLimitOrders: true,
    isDark: true,
    minQuantity: 10_000,
  },
  RFQ: { mic: "RFQ", name: "Request for Quote", supportsMarketOrders: false, supportsLimitOrders: true, isDark: false },
  EBS: { mic: "EBS", name: "EBS (FX)", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
  XCME: { mic: "XCME", name: "CME", supportsMarketOrders: true, supportsLimitOrders: true, isDark: false },
};

export function isRegisteredVenue(mic: string): mic is RegisteredVenueMIC {
  return mic in FIX_VENUE_REGISTRY;
}

export function getFixVenueCapabilities(mic: string): FixVenueCapabilities | undefined {
  return isRegisteredVenue(mic) ? FIX_VENUE_REGISTRY[mic] : undefined;
}

export interface VenueValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates a NewOrderSingle's ExDestination/OrdType/OrderQty against the
 * resolved venue's capabilities. An empty/absent ExDestination is treated
 * as valid (no venue routing requested) rather than rejected, since venue
 * routing is optional on this exchange today — a client that never sends
 * ExDestination should see no behavior change from before this check
 * existed.
 */
export function validateVenueRouting(
  exDestination: string | undefined,
  ordTypeIsMarket: boolean,
  orderQty: number
): VenueValidationResult {
  if (!exDestination) return { ok: true };

  const venue = getFixVenueCapabilities(exDestination);
  if (!venue) return { ok: false, reason: `Unknown venue ${exDestination}` };

  if (ordTypeIsMarket && !venue.supportsMarketOrders) {
    return { ok: false, reason: `${venue.name} does not support market orders` };
  }
  if (!ordTypeIsMarket && !venue.supportsLimitOrders) {
    return { ok: false, reason: `${venue.name} does not support limit orders` };
  }
  if (venue.minQuantity !== undefined && orderQty < venue.minQuantity) {
    return { ok: false, reason: `${venue.name} requires a minimum quantity of ${venue.minQuantity}` };
  }
  return { ok: true };
}
