import type { TicketContext } from "../ticket-types";

const DARK_POOL_MIN_BLOCK = 10_000;

export function checkDarkPoolEligible(ctx: TicketContext): boolean {
  return (
    ctx.limits.dark_pool_access === true &&
    ctx.draft.quantity >= DARK_POOL_MIN_BLOCK &&
    ctx.instrument.instrumentType === "equity"
  );
}
