export interface MarginAccount {
  userId: string;
  initialMarginPosted: number;
  unrealisedPnl: number;
  netMarginRequired: number;
  positions: Record<string, number>;
  costBasis: Record<string, number>;
  lastUpdated: number;
}

export const INITIAL_MARGIN_RATE: Record<string, number> = {
  equity: 0.1,
  fi: 0.02,
  derivatives: 0.15,
  otc: 0.05,
};

const DUST_THRESHOLD = 0.0001;

/**
 * Applies a fill to a margin account's position and cost basis. Mutates
 * `acct` in place — a margin account is ledger state, not a value to
 * recompute from scratch each time.
 *
 * Opening a fresh position from flat, or adding to an existing position in
 * the same direction (long+BUY or short+SELL), recomputes a weighted-average
 * cost basis — symmetric for both longs and shorts. Reducing a position
 * (trading against the existing direction, without flipping through zero)
 * updates quantity but leaves cost basis untouched; this does not realize
 * P&L on the reduced portion, since realized P&L is not tracked by this
 * account model at all today. Flipping through zero (e.g. SELL more than
 * a long holds) re-seeds cost basis at the trade price for the new,
 * opposite-direction position, since none of the old cost basis applies
 * to it.
 */
export function updatePosition(
  acct: MarginAccount,
  asset: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number
): void {
  const sign = side === "BUY" ? 1 : -1;
  const currentQty = acct.positions[asset] ?? 0;
  const currentCost = acct.costBasis[asset] ?? 0;

  const newQty = currentQty + sign * qty;
  const isAdding = currentQty === 0 || Math.sign(currentQty) === Math.sign(sign);

  if (Math.abs(newQty) < DUST_THRESHOLD) {
    delete acct.positions[asset];
    delete acct.costBasis[asset];
  } else if (isAdding) {
    const totalCost = Math.abs(currentQty) * currentCost + qty * price;
    acct.positions[asset] = newQty;
    acct.costBasis[asset] = totalCost / Math.abs(newQty);
  } else if (Math.sign(newQty) !== Math.sign(currentQty)) {
    // Flipped through zero — the new position is in the opposite direction
    // to the old one, so none of the prior cost basis applies.
    acct.positions[asset] = newQty;
    acct.costBasis[asset] = price;
  } else {
    acct.positions[asset] = newQty;
    acct.costBasis[asset] = currentCost;
  }
}

/** Initial margin required to post for a new position, by desk. Unknown desks fall back to the equity rate. */
export function computeInitialMargin(desk: string, notional: number): number {
  const rate = INITIAL_MARGIN_RATE[desk] ?? INITIAL_MARGIN_RATE.equity;
  return parseFloat((notional * rate).toFixed(2));
}

/** Margin released on settlement of a position, by desk. Same rate table as computeInitialMargin — kept as one shared function so post/release can't silently drift. */
export function computeMarginRelease(desk: string, notional: number): number {
  return computeInitialMargin(desk, notional);
}

export interface MarginCallResult {
  unrealisedPnl: number;
  maintenanceRequired: number;
  effectiveMargin: number;
  variationCall: number | null;
}

/**
 * Marks a margin account to market against current prices and determines
 * whether a variation margin call is due.
 *
 * Maintenance requirement is 70% of net initial margin while any position
 * is open; it snaps to 100% (the full initial requirement) once positions
 * are flat, on the read that a flat account has no market exposure to
 * hold margin against reduced-rate — a call only fires while
 * `initialMarginPosted > 0`, so a flat account with no margin posted at
 * all never triggers one regardless of this snap.
 *
 * A call is only returned when initial margin has actually been posted,
 * the account is genuinely under the maintenance threshold, and the
 * computed shortfall is strictly positive — a rounding-driven zero or
 * negative shortfall does not count as a call.
 */
export function computeMarginCall(
  acct: Pick<MarginAccount, "positions" | "costBasis" | "initialMarginPosted" | "netMarginRequired">,
  prices: Record<string, number>
): MarginCallResult {
  let unrealisedPnl = 0;
  for (const [asset, qty] of Object.entries(acct.positions)) {
    const currentPrice = prices[asset];
    if (!currentPrice || Math.abs(qty) < DUST_THRESHOLD) continue;
    const costBasis = acct.costBasis[asset] ?? currentPrice;
    unrealisedPnl += qty * (currentPrice - costBasis);
  }
  unrealisedPnl = parseFloat(unrealisedPnl.toFixed(2));

  const hasPositions = Object.keys(acct.positions).length > 0;
  const maintenanceRequired = acct.netMarginRequired * (hasPositions ? 0.7 : 1);
  const effectiveMargin = acct.initialMarginPosted + unrealisedPnl;

  let variationCall: number | null = null;
  if (acct.initialMarginPosted > 0 && effectiveMargin < maintenanceRequired) {
    const computed = parseFloat((acct.netMarginRequired - effectiveMargin).toFixed(2));
    if (computed > 0) variationCall = computed;
  }

  return { unrealisedPnl, maintenanceRequired, effectiveMargin, variationCall };
}
