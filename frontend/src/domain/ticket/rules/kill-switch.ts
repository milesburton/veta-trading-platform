import { isOrderBlocked } from "../../../store/killSwitchSlice";
import type { Diagnostic, TicketContext } from "../ticket-types";

export function runKillSwitchCheck(ctx: TicketContext): Diagnostic[] {
  const blocked = isOrderBlocked(ctx.killBlocks, {
    asset: ctx.instrument.symbol,
    strategy: ctx.draft.strategy,
    userId: ctx.userId,
  });

  if (blocked) {
    return [
      {
        field: "*",
        severity: "error",
        message: "Kill switch active — this order is currently blocked",
        ruleId: "kill-switch-blocked",
      },
    ];
  }
  return [];
}
