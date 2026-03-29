import { getVenueCapabilities } from "../../market/venue-capabilities";
import type { Diagnostic, TicketContext } from "../ticket-types";

export function runVenueRules(ctx: TicketContext): Diagnostic[] {
  const { selectedVenue, draft, session } = ctx;
  const diagnostics: Diagnostic[] = [];

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

  if (venue.isDark && session.phase === "HALTED") {
    diagnostics.push({
      field: "venue",
      severity: "error",
      message: "Dark pool routing is unavailable during trading halts",
      ruleId: "venue.dark-halted",
    });
  }

  if (!venue.supportedStrategies.includes(draft.strategy)) {
    diagnostics.push({
      field: "strategy",
      severity: "error",
      message: `${draft.strategy} is not supported on ${venue.name}`,
      ruleId: "venue.strategy-unsupported",
    });
  }

  if (!venue.supportsMarketOrders && draft.limitPrice <= 0) {
    diagnostics.push({
      field: "limitPrice",
      severity: "error",
      message: `${venue.name} does not accept market orders — a limit price is required`,
      ruleId: "venue.no-market-orders",
    });
  }

  if (draft.strategy === "ICEBERG" && !venue.supportsIceberg) {
    diagnostics.push({
      field: "strategy",
      severity: "error",
      message: `Iceberg orders are not supported on ${venue.name}`,
      ruleId: "venue.no-iceberg",
    });
  }

  if (venue.minQuantity && draft.quantity > 0 && draft.quantity < venue.minQuantity) {
    diagnostics.push({
      field: "quantity",
      severity: "error",
      message: `${venue.name} requires minimum quantity of ${venue.minQuantity.toLocaleString()} shares`,
      ruleId: "venue.min-quantity",
    });
  }

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

  if (
    venue.supportsAuction &&
    !venue.isDark &&
    (session.phase === "OPENING_AUCTION" || session.phase === "CLOSING_AUCTION")
  ) {
    // Auction-capable venue during auction — no diagnostic needed
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
