import type { Diagnostic, TicketContext } from "../ticket-types";

const COLLAR_WARNING_PCT = 0.02;
const COLLAR_ERROR_PCT = 0.05;

export function runPriceCollarCheck(ctx: TicketContext): Diagnostic[] {
  const { instrument, draft } = ctx;
  const diagnostics: Diagnostic[] = [];
  const isEquityLike =
    instrument.instrumentType !== "option" && instrument.instrumentType !== "bond";

  if (!isEquityLike || !instrument.currentPrice || instrument.currentPrice <= 0) return diagnostics;
  if (draft.limitPrice <= 0) return diagnostics;

  const deviation = Math.abs(draft.limitPrice - instrument.currentPrice) / instrument.currentPrice;

  if (deviation >= COLLAR_ERROR_PCT) {
    const pct = (deviation * 100).toFixed(1);
    const direction = draft.limitPrice > instrument.currentPrice ? "above" : "below";
    diagnostics.push({
      field: "limitPrice",
      severity: "error",
      message: `Limit price is ${pct}% ${direction} current market ($${instrument.currentPrice.toFixed(2)}) — exceeds price collar`,
      ruleId: "price-collar.exceeds-max",
    });
  } else if (deviation >= COLLAR_WARNING_PCT) {
    const pct = (deviation * 100).toFixed(1);
    const direction = draft.limitPrice > instrument.currentPrice ? "above" : "below";
    diagnostics.push({
      field: "limitPrice",
      severity: "warning",
      message: `Limit price is ${pct}% ${direction} current market ($${instrument.currentPrice.toFixed(2)})`,
      ruleId: "price-collar.deviation",
    });
  }

  return diagnostics;
}
