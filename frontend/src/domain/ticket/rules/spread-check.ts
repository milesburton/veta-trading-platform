import type { Diagnostic, TicketContext } from "../ticket-types";

const SPREAD_WARNING_THRESHOLD_BPS = 50;
const SPREAD_ERROR_THRESHOLD_BPS = 200;

export function runSpreadCheck(ctx: TicketContext): Diagnostic[] {
  const { spreadBps, instrument } = ctx;
  const diagnostics: Diagnostic[] = [];
  const isEquityLike =
    instrument.instrumentType !== "option" && instrument.instrumentType !== "bond";

  if (!isEquityLike || spreadBps === undefined) return diagnostics;

  if (spreadBps >= SPREAD_ERROR_THRESHOLD_BPS) {
    diagnostics.push({
      field: "*",
      severity: "error",
      message: `Bid-ask spread is ${spreadBps.toFixed(0)} bps — exceeds maximum threshold, order blocked`,
      ruleId: "spread.exceeds-max",
    });
  } else if (spreadBps >= SPREAD_WARNING_THRESHOLD_BPS) {
    diagnostics.push({
      field: "*",
      severity: "warning",
      message: `Bid-ask spread is ${spreadBps.toFixed(0)} bps — wider than normal, check liquidity`,
      ruleId: "spread.wide",
    });
  }

  return diagnostics;
}
