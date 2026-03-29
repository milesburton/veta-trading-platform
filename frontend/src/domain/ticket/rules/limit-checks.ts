import type { Diagnostic, TicketContext } from "../ticket-types";

export function runLimitChecks(ctx: TicketContext): Diagnostic[] {
  const { draft, instrument, limits } = ctx;
  const isOptions = instrument.instrumentType === "option";
  const isBond = instrument.instrumentType === "bond";

  if (isOptions || isBond) return [];

  const diagnostics: Diagnostic[] = [];
  const qty = draft.quantity;
  const price = draft.limitPrice;
  const lotSize = instrument.lotSize;

  if (qty > 0 && lotSize > 1 && qty % lotSize !== 0) {
    const nearest = Math.round(qty / lotSize) * lotSize;
    diagnostics.push({
      field: "quantity",
      severity: "warning",
      message: `Quantity must be a multiple of the lot size (${lotSize}). Nearest: ${nearest}`,
      ruleId: "lot-size",
    });
  }

  if (qty > 0 && limits.max_order_qty > 0 && qty > limits.max_order_qty) {
    diagnostics.push({
      field: "quantity",
      severity: "error",
      message: `Quantity ${qty.toLocaleString()} exceeds your limit of ${limits.max_order_qty.toLocaleString()} shares`,
      ruleId: "qty-exceeds-limit",
    });
  }

  if (qty > 0 && price > 0) {
    const notional = qty * price;
    if (notional > limits.max_daily_notional) {
      diagnostics.push({
        field: "*",
        severity: "error",
        message: `Notional $${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })} exceeds your daily limit of $${limits.max_daily_notional.toLocaleString()}`,
        ruleId: "notional-exceeds-limit",
      });
    }
  }

  if (!limits.allowed_strategies.includes(draft.strategy)) {
    diagnostics.push({
      field: "strategy",
      severity: "error",
      message: `Strategy ${draft.strategy} is not permitted for your account`,
      ruleId: "strategy-not-permitted",
    });
  }

  return diagnostics;
}
