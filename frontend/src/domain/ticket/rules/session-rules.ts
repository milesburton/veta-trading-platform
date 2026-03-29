import { isAuction, isStrategyAllowedInSession } from "../../market/market-session";
import type { Diagnostic, TicketContext } from "../ticket-types";

export function runSessionRules(ctx: TicketContext): Diagnostic[] {
  const { session, draft, instrument } = ctx;
  const diagnostics: Diagnostic[] = [];
  const isEquityLike =
    instrument.instrumentType !== "option" && instrument.instrumentType !== "bond";

  // Options/bonds go through RFQ or separate venues with their own session logic.
  if (!isEquityLike) return diagnostics;

  if (!session.allowsOrderEntry) {
    diagnostics.push({
      field: "*",
      severity: "error",
      message:
        session.phase === "HALTED"
          ? "Trading is halted — order entry is suspended"
          : session.phase === "CLOSED"
            ? "Market is closed — order entry is not available"
            : `Order entry not available during ${session.phaseLabel}`,
      ruleId: "session.entry-blocked",
    });
    return diagnostics;
  }

  if (!isStrategyAllowedInSession(session, draft.strategy)) {
    const inAuction = isAuction(session.phase);
    diagnostics.push({
      field: "strategy",
      severity: "error",
      message: inAuction
        ? `${draft.strategy} is not available during ${session.phaseLabel} — only limit orders are accepted`
        : `${draft.strategy} is not supported during ${session.phaseLabel}`,
      ruleId: "session.strategy-not-supported",
    });
  }

  if (isAuction(session.phase)) {
    diagnostics.push({
      field: "*",
      severity: "info",
      message: `${session.phaseLabel} in progress — orders will match at auction price`,
      ruleId: "session.auction-info",
    });
  }

  if (session.phase === "PRE_OPEN") {
    diagnostics.push({
      field: "*",
      severity: "info",
      message: "Pre-open session — orders will queue for the opening auction",
      ruleId: "session.pre-open-info",
    });
  }

  return diagnostics;
}
