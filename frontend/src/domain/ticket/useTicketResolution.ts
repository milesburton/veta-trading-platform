import { useRef } from "react";
import { resolveTicket } from "./resolve-ticket";
import type { TicketContext, TicketResolution } from "./ticket-types";

/**
 * Structurally-memoized ticket resolution.
 *
 * Uses shallow structural comparison instead of reference equality so that
 * replacing objects with identical values (common with Redux) does not
 * trigger re-resolution or downstream re-renders.
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

function contextEqual(a: TicketContext, b: TicketContext): boolean {
  if (a.userId !== b.userId) return false;
  if (a.userRole !== b.userRole) return false;

  if (a.session.phase !== b.session.phase) return false;
  if (a.session.allowsOrderEntry !== b.session.allowsOrderEntry) return false;

  if (a.selectedVenue !== b.selectedVenue) return false;
  if (a.spreadBps !== b.spreadBps) return false;

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

  if (a.killBlocks !== b.killBlocks) return false;

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
