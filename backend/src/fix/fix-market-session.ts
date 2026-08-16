import type { SessionPhase } from "@veta/market-client";

/**
 * ADR 0003 Phase 6: reject NewOrderSingle while the market is HALTED or
 * CLOSED. An undefined phase (no tick received yet) is treated as open —
 * permissive-by-default, matching the ADR's guidance for the equivalent
 * undefined-phase case in the algo strategies (Phase 5), so a fix-exchange
 * connection immediately after startup isn't wrongly rejected before its
 * first market-sim tick arrives.
 */
export function isMarketOpenForOrderEntry(sessionPhase: SessionPhase | undefined): boolean {
  return sessionPhase !== "HALTED" && sessionPhase !== "CLOSED";
}
