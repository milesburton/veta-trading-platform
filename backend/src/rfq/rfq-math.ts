export interface BondSpec {
  isin: string;
  symbol: string;
  description: string;
  couponRate: number;
  maturityDate: string;
  totalPeriods: number;
  periodsPerYear: number;
  faceValue: number;
  yieldAtOrder: number;
  creditRating: string;
}

export interface DealerProfile {
  id: string;
  name: string;
  baseSpreadBps: number;
  responseRate: number;
  latencyMs: [number, number];
  specialisation: "UST" | "Corp" | "all";
}

export interface DealerQuote {
  dealerId: string;
  dealerName: string;
  price: number;
  yield: number;
  spreadBps: number;
  notional: number;
  receivedAt: number;
}

/**
 * Prices a bond as clean price (fraction of face value) using the standard
 * discrete-period present-value-of-annuity formula. This is a deliberately
 * separate, purpose-built formula from analytics/bond-pricing.ts's
 * priceBond — that one prices an absolute dollar value via continuous
 * compounding for portfolio risk metrics (duration/convexity/DV01); this
 * one prices a percent-of-par clean quote for a dealer RFQ workflow, the
 * conventional discrete-compounding convention bond desks actually quote
 * against. The two are not meant to agree on the same inputs and are not
 * interchangeable.
 */
export function priceBond(spec: BondSpec, yieldAnnual: number): number {
  const { couponRate, totalPeriods, periodsPerYear, faceValue } = spec;
  const r = yieldAnnual / periodsPerYear;
  const couponPayment = faceValue * (couponRate / periodsPerYear);
  if (r === 0) {
    return (couponPayment * totalPeriods + faceValue) / faceValue;
  }
  const pv =
    (couponPayment * (1 - (1 + r) ** -totalPeriods)) / r + faceValue * (1 + r) ** -totalPeriods;
  return parseFloat((pv / faceValue).toFixed(6));
}

/** True for US Treasuries: AAA-rated with a US9128-prefixed ISIN. */
export function isUstBond(spec: Pick<BondSpec, "creditRating" | "isin">): boolean {
  return spec.creditRating === "AAA" && spec.isin.startsWith("US9128");
}

/**
 * A dealer's spread discount for quoting within its stated specialisation
 * (UST dealers tighten on treasuries, Corp dealers tighten on non-UST).
 * Zero for "all"-specialisation dealers or a mismatch between dealer
 * specialisation and bond type.
 */
export function specialisationBonus(dealer: Pick<DealerProfile, "specialisation">, isUst: boolean): number {
  if (dealer.specialisation === "UST" && isUst) return 0.5;
  if (dealer.specialisation === "Corp" && !isUst) return 0.5;
  return 0;
}

/**
 * Computes a dealer's quoted yield and clean price for an RFQ, given an
 * already-resolved spread (bps) and side. Deterministic — the caller
 * supplies the spread (which in production includes Math.random() jitter)
 * so this function itself has no randomness and no timing, making it
 * directly unit-testable independent of simulateDealerQuote's
 * response-rate/latency simulation.
 */
export function computeDealerYieldAndPrice(
  spec: BondSpec,
  side: "BUY" | "SELL",
  spreadBps: number
): { yield: number; price: number } {
  // BUY: dealer offers at ask (higher yield); SELL: dealer bids (lower
  // yield = higher price).
  const spreadFactor = side === "BUY" ? 1 : -1;
  const dealerYield = spec.yieldAtOrder + (spreadFactor * spreadBps) / 10_000;
  const price = priceBond(spec, dealerYield);
  return { yield: parseFloat(dealerYield.toFixed(6)), price };
}

/**
 * Picks the best quote for the client's side: lowest yield (highest
 * price) for a BUY, highest yield (lowest price) for a SELL. Ties keep
 * the first quote seen. Returns undefined for an empty quote list.
 */
export function selectBestQuote(
  quotes: DealerQuote[],
  side: "BUY" | "SELL"
): DealerQuote | undefined {
  if (quotes.length === 0) return undefined;
  return quotes.reduce((best, q) =>
    side === "BUY" ? (q.yield < best.yield ? q : best) : q.yield > best.yield ? q : best
  );
}
