export interface FillResult {
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number;
  marketImpactBps: number;
}

export function computeFill(
  requestedQty: number,
  side: "BUY" | "SELL",
  midPrice: number,
  tickVolume: number,
  participationCap: number,
  impactPer1000: number
): FillResult {
  const maxFill = Math.floor(tickVolume * participationCap);
  const filledQty = Math.min(requestedQty, maxFill);
  const remainingQty = requestedQty - filledQty;
  const impactBps = (filledQty / 1_000) * impactPer1000;
  const impactFactor = side === "BUY" ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000;
  const avgFillPrice = parseFloat((midPrice * impactFactor).toFixed(4));
  return { filledQty, remainingQty, avgFillPrice, marketImpactBps: impactBps };
}
