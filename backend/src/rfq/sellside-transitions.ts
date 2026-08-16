export type SellSideRfqState =
  | "CLIENT_REQUEST"
  | "SALES_REVIEW"
  | "DEALER_QUOTE"
  | "SALES_MARKUP"
  | "CLIENT_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED";

export type SellSideAction = "route" | "markup" | "confirm" | "reject";

export interface TransitionOk {
  ok: true;
}
export interface TransitionErr {
  ok: false;
  error: string;
  status: number;
}
export type TransitionResult = TransitionOk | TransitionErr;

/**
 * Validates whether a sell-side RFQ action is allowed from its current
 * state, independent of the HTTP handler's body-parsing and side effects.
 * Mirrors the guards inline in rfq-service.ts's action-route handler
 * exactly, so behaviour doesn't drift between the two.
 */
export function checkSellSideTransition(
  action: SellSideAction,
  currentState: SellSideRfqState
): TransitionResult {
  if (action === "route") {
    if (currentState !== "CLIENT_REQUEST") {
      return { ok: false, error: `Cannot route from state ${currentState}`, status: 409 };
    }
    return { ok: true };
  }
  if (action === "markup") {
    if (currentState !== "SALES_MARKUP") {
      return { ok: false, error: `Cannot apply markup from state ${currentState}`, status: 409 };
    }
    return { ok: true };
  }
  if (action === "confirm") {
    if (currentState !== "CLIENT_CONFIRMATION") {
      return { ok: false, error: `Cannot confirm from state ${currentState}`, status: 409 };
    }
    return { ok: true };
  }
  // reject
  if (currentState === "CONFIRMED" || currentState === "REJECTED") {
    return { ok: false, error: `Cannot reject from state ${currentState}`, status: 409 };
  }
  return { ok: true };
}

/**
 * Checks the actor-matching authorization rule for an action, separate
 * from the state guard above. "route" and "reject" have no actor check;
 * "markup" requires the acting salesUserId to match the RFQ's assigned
 * sales rep; "confirm" requires the acting clientUserId to match the
 * RFQ's client.
 */
export function checkSellSideActor(
  action: SellSideAction,
  actorId: string | undefined,
  expected: { salesUserId?: string; clientUserId?: string }
): TransitionResult {
  if (action === "markup") {
    if (!actorId || actorId !== expected.salesUserId) {
      return { ok: false, error: "salesUserId does not match", status: 403 };
    }
    return { ok: true };
  }
  if (action === "confirm") {
    if (!actorId || actorId !== expected.clientUserId) {
      return { ok: false, error: "clientUserId does not match", status: 403 };
    }
    return { ok: true };
  }
  return { ok: true };
}

/** Sales markup applied to a dealer's price — marks up for a client BUY, marks down for a client SELL, protecting the desk's spread either way. */
export function computeMarkupPrice(
  dealerPrice: number,
  side: "BUY" | "SELL",
  markupBps: number
): number {
  const price = side === "BUY" ? dealerPrice * (1 + markupBps / 10_000) : dealerPrice * (1 - markupBps / 10_000);
  return parseFloat(price.toFixed(4));
}
