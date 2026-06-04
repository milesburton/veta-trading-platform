export const VENUES = [
  { mic: "XNAS", weight: 30 },
  { mic: "XNYS", weight: 25 },
  { mic: "ARCX", weight: 15 },
  { mic: "BATS", weight: 12 },
  { mic: "EDGX", weight: 8 },
  { mic: "IEX", weight: 6 },
  { mic: "MEMX", weight: 4 },
] as const;

export type VenueMIC = (typeof VENUES)[number]["mic"];

export const VENUE_SPREAD_MULT: Record<string, number> = {
  XNAS: 1.0,
  ARCX: 1.08,
  BATS: 0.95,
  EDGX: 0.98,
  IEX: 1.02,
  MEMX: 0.97,
  XNYS: 1.05,
};

export const VENUE_DEPTH_MULT: Record<string, number> = {
  XNAS: 1.0,
  ARCX: 0.85,
  BATS: 0.9,
  EDGX: 0.75,
  IEX: 0.95,
  MEMX: 0.65,
  XNYS: 1.2,
};

export const VALID_VENUES = new Set(Object.keys(VENUE_SPREAD_MULT));

export const PARTICIPATION_CAP_DEFAULT = 0.2;
export const IMPACT_PER_1000_DEFAULT = 1.0;
export const COMMISSION_PER_SHARE = 0.005;
export const SEC_FEE_RATE = 0.000008;
export const FINRA_TAF_PER_SHARE = 0.000119;
export const FINRA_TAF_CAP_USD = 5.95;
export const MAKER_REBATE_PER_SHARE = -0.002;

export function computeFill(
  qty: number,
  tickVolume: number,
  venue: VenueMIC,
  participationCap: number = PARTICIPATION_CAP_DEFAULT
): { filledQty: number; remainingQty: number } {
  const depthMult = VENUE_DEPTH_MULT[venue] ?? 1.0;
  const maxFill = Math.floor(tickVolume * participationCap * depthMult);
  const filledQty = Math.min(qty, maxFill);
  return { filledQty, remainingQty: qty - filledQty };
}

export function computeImpactBps(
  filledQty: number,
  venue: VenueMIC,
  impactPer1000: number = IMPACT_PER_1000_DEFAULT
): number {
  const spreadMult = VENUE_SPREAD_MULT[venue] ?? 1.0;
  return (filledQty / 1_000) * impactPer1000 * spreadMult;
}

export function computeImpact(
  filledQty: number,
  venue: VenueMIC,
  side: "BUY" | "SELL",
  midPrice: number,
  impactPer1000: number = IMPACT_PER_1000_DEFAULT
): number {
  const impactBps = computeImpactBps(filledQty, venue, impactPer1000);
  const impactFactor = side === "BUY" ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000;
  return parseFloat((midPrice * impactFactor).toFixed(4));
}

export function computeFees(
  filledQty: number,
  avgFillPrice: number,
  side: "BUY" | "SELL",
  liquidityFlag: "MAKER" | "TAKER" | "CROSS"
): {
  commissionUSD: number;
  secFeeUSD: number;
  finraTafUSD: number;
  totalFeeUSD: number;
} {
  const commissionPerShare =
    liquidityFlag === "MAKER" ? MAKER_REBATE_PER_SHARE : COMMISSION_PER_SHARE;
  const commissionUSD = parseFloat((filledQty * commissionPerShare).toFixed(2));
  const notional = filledQty * avgFillPrice;
  const secFeeUSD = side === "SELL" ? parseFloat((notional * SEC_FEE_RATE).toFixed(4)) : 0;
  const finraTafUSD =
    side === "SELL"
      ? parseFloat(Math.min(filledQty * FINRA_TAF_PER_SHARE, FINRA_TAF_CAP_USD).toFixed(4))
      : 0;
  const totalFeeUSD = parseFloat((commissionUSD + secFeeUSD + finraTafUSD).toFixed(4));
  return { commissionUSD, secFeeUSD, finraTafUSD, totalFeeUSD };
}

export function pickWeightedVenue(rand: number = Math.random()): VenueMIC {
  const total = VENUES.reduce((s, v) => s + v.weight, 0);
  let cumulativeWeight = rand * total;
  for (const v of VENUES) {
    cumulativeWeight -= v.weight;
    if (cumulativeWeight <= 0) return v.mic;
  }
  return VENUES[0].mic;
}

export function execId(seq: number): string {
  return `EX${String(seq).padStart(8, "0")}`;
}
