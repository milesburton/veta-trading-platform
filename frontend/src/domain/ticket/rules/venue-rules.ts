import { getVenueCapabilities } from "../../market/venue-capabilities";
import type { Diagnostic, TicketContext } from "../ticket-types";

/**
 * Venue-constraint validation rules.
 *
 * When the user has explicitly selected a routing venue, these rules
 * verify the order is compatible with that venue's capabilities.
 */
export function runVenueRules(ctx: TicketContext): Diagnostic[] {
  const { selectedVenue, draft, session } = ctx;
  const diagnostics: Diagnostic[] = [];

  // No venue selected → SOR will route automatically, skip venue-specific checks
  if (!selectedVenue) return diagnostics;

  const venue = getVenueCapabilities(selectedVenue);
  if (!venue) {
    diagnostics.push({
      field: "venue",
      severity: "error",
      message: `Unknown venue: ${selectedVenue}`,
      ruleId: "venue.unknown",
    });
    return diagnostics;
  }

  // 1. Dark pool unavailable during halt
  if (venue.isDark && session.phase === "HALTED") {
    diagnostics.push({
      field: "venue",
      severity: "error",
      message: "Dark pool routing is unavailable during trading halts",
      ruleId: "venue.dark-halted",
    });
  }

  // 2. Strategy not supported by this venue
  if (!venue.supportedStrategies.includes(draft.strategy)) {
    diagnostics.push({
      field: "strategy",
      severity: "error",
      message: `${draft.strategy} is not supported on ${venue.name}`,
      ruleId: "venue.strategy-unsupported",
    });
  }

  // 3. Limit price required if venue doesn't support market orders
  if (!venue.supportsMarketOrders && draft.limitPrice <= 0) {
    diagnostics.push({
      field: "limitPrice",
      severity: "error",
      message: `${venue.name} does not accept market orders — a limit price is required`,
      ruleId: "venue.no-market-orders",
    });
  }

  // 4. Iceberg not supported
  if (draft.strategy === "ICEBERG" && !venue.supportsIceberg) {
    diagnostics.push({
      field: "strategy",
      severity: "error",
      message: `Iceberg orders are not supported on ${venue.name}`,
      ruleId: "venue.no-iceberg",
    });
  }

  // 5. Minimum quantity
  if (venue.minQuantity && draft.quantity > 0 && draft.quantity < venue.minQuantity) {
    diagnostics.push({
      field: "quantity",
      severity: "error",
      message: `${venue.name} requires minimum quantity of ${venue.minQuantity.toLocaleString()} shares`,
      ruleId: "venue.min-quantity",
    });
  }

  // 6. Minimum notional
  if (venue.minNotional && draft.quantity > 0 && draft.limitPrice > 0) {
    const notional = draft.quantity * draft.limitPrice;
    if (notional < venue.minNotional) {
      diagnostics.push({
        field: "quantity",
        severity: "error",
        message: `${venue.name} requires minimum notional of $${venue.minNotional.toLocaleString()}`,
        ruleId: "venue.min-notional",
      });
    }
  }

  // 7. Auction venue selected but phase is not an auction
  if (
    venue.supportsAuction &&
    !venue.isDark &&
    (session.phase === "OPENING_AUCTION" || session.phase === "CLOSING_AUCTION")
  ) {
    // This is fine — just informational
  } else if (
    !venue.supportsAuction &&
    (session.phase === "OPENING_AUCTION" || session.phase === "CLOSING_AUCTION")
  ) {
    diagnostics.push({
      field: "venue",
      severity: "warning",
      message: `${venue.name} does not participate in auctions — order may not execute during ${session.phaseLabel}`,
      ruleId: "venue.no-auction-support",
    });
  }

  return diagnostics;
}
