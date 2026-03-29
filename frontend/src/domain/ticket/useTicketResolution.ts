import { useRef } from "react";
import { resolveTicket } from "./resolve-ticket";
import type { TicketContext, TicketResolution } from "./ticket-types";

/**
 * Structurally-memoized ticket resolution.
 *
 * Instead of relying on React's useMemo (which re-runs when any reference
 * in the deps array changes), this hook performs **shallow structural
 * comparison** of the TicketContext fields that matter to rule evaluation.
 *
 * This means:
 * - A market tick that doesn't change the selected symbol's price → no re-resolve
 * - A Redux dispatch that replaces the `limits` object with an identical copy → no re-resolve
 * - Only genuine value changes trigger resolveTicket()
 *
 * resolveTicket() itself runs in <0.1ms, but avoiding unnecessary calls also
 * avoids creating new object references, which prevents downstream React
 * re-renders of components consuming the resolution.
 */
export function useTicketResolution(ctx: TicketContext): TicketResolution {
  const prevCtxRef = useRef<TicketContext | null>(null);
  const prevResRef = useRef<TicketResolution | null>(null);

  if (prevCtxRef.current !== null && contextEqual(prevCtxRef.current, ctx)) {
    return prevResRef.current as TicketResolution;
  }

  const resolution = resolveTicket(ctx);
  prevCtxRef.current = ctx;
  prevResRef.current = resolution;
  return resolution;
}

/**
 * Shallow structural equality check on the fields that influence rule output.
 * This is deliberately NOT a deep-equal — we check exactly the fields that
 * rules read, at exactly the depth they read them.
 */
function contextEqual(a: TicketContext, b: TicketContext): boolean {
  // Identity — same session / user
  if (a.userId !== b.userId) return false;
  if (a.userRole !== b.userRole) return false;

  // Limits — shallow fields
  if (a.limits !== b.limits) {
    const al = a.limits;
    const bl = b.limits;
    if (
      al.max_order_qty !== bl.max_order_qty ||
      al.max_daily_notional !== bl.max_daily_notional ||
      al.dark_pool_access !== bl.dark_pool_access ||
      !arraysEqual(al.allowed_strategies, bl.allowed_strategies) ||
      !arraysEqual(al.allowed_desks, bl.allowed_desks)
    )
      return false;
  }

  // Kill blocks — reference check is sufficient; Redux replaces array on change
  if (a.killBlocks !== b.killBlocks) return false;

  // Instrument
  const ai = a.instrument;
  const bi = b.instrument;
  if (
    ai.instrumentType !== bi.instrumentType ||
    ai.symbol !== bi.symbol ||
    ai.lotSize !== bi.lotSize ||
    ai.currentPrice !== bi.currentPrice ||
    ai.orderBookMid !== bi.orderBookMid
  )
    return false;

  // Draft order values
  const ad = a.draft;
  const bd = b.draft;
  if (
    ad.side !== bd.side ||
    ad.quantity !== bd.quantity ||
    ad.limitPrice !== bd.limitPrice ||
    ad.strategy !== bd.strategy ||
    ad.expiresAtSecs !== bd.expiresAtSecs ||
    ad.tif !== bd.tif
  )
    return false;

  // Option draft
  const ao = a.option;
  const bo = b.option;
  if (
    ao.optionType !== bo.optionType ||
    ao.strike !== bo.strike ||
    ao.expirySecs !== bo.expirySecs ||
    ao.hasQuote !== bo.hasQuote ||
    ao.isFetching !== bo.isFetching
  )
    return false;

  // Bond draft
  const ab = a.bond;
  const bb = b.bond;
  if (
    ab.symbol !== bb.symbol ||
    ab.yieldPct !== bb.yieldPct ||
    ab.hasQuote !== bb.hasQuote ||
    ab.isFetching !== bb.isFetching ||
    ab.hasBondDef !== bb.hasBondDef
  )
    return false;

  return true;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
