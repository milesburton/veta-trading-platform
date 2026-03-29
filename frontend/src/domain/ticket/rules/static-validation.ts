import type { Diagnostic, TicketContext } from "../ticket-types";

export function runStaticValidation(ctx: TicketContext): Diagnostic[] {
  const { draft, instrument } = ctx;
  const isOptions = instrument.instrumentType === "option";
  const isBond = instrument.instrumentType === "bond";
  const diagnostics: Diagnostic[] = [];

  if (draft.quantity <= 0) {
    diagnostics.push({
      field: "quantity",
      severity: "error",
      message: "Quantity must be greater than zero",
      ruleId: "qty-positive",
    });
  }

  if (!isOptions && !isBond && draft.limitPrice <= 0) {
    diagnostics.push({
      field: "limitPrice",
      severity: "error",
      message: "Limit price must be greater than zero",
      ruleId: "price-positive",
    });
  }

  if (!isOptions && !isBond && draft.expiresAtSecs <= 0) {
    diagnostics.push({
      field: "expiresAt",
      severity: "error",
      message: "Duration must be greater than zero",
      ruleId: "duration-positive",
    });
  }

  if (!instrument.symbol) {
    diagnostics.push({
      field: "symbol",
      severity: "error",
      message: "An instrument must be selected",
      ruleId: "symbol-required",
    });
  }

  return diagnostics;
}
