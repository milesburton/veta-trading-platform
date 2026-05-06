import type { ScenarioActual } from "./types.ts";

export interface OutcomeOrder {
  side: "BUY" | "SELL";
  limitPrice: number;
  children: Array<{
    id: string;
    status: string;
    filled: number;
    avgFillPrice?: number;
    limitPrice?: number;
  }>;
}

export function computeActual(
  order: OutcomeOrder,
  triggeredAtMs: number,
  completedAtMs: number,
): ScenarioActual {
  const fills = order.children.filter((c) => c.status === "filled" && c.filled > 0);
  const totalFilled = fills.reduce((s, c) => s + c.filled, 0);
  const totalNotional = fills.reduce(
    (s, c) => s + (c.avgFillPrice ?? c.limitPrice ?? 0) * c.filled,
    0,
  );
  const avgFillPrice = totalFilled > 0 ? totalNotional / totalFilled : 0;
  const ref = order.limitPrice;
  const avgFillPriceBps = ref > 0 ? ((avgFillPrice - ref) / ref) * 10_000 : 0;
  const slippageBps =
    order.side === "BUY"
      ? Math.max(0, avgFillPriceBps)
      : Math.max(0, -avgFillPriceBps);
  return {
    fillCount: fills.length,
    totalFilled,
    avgFillPrice: Number(avgFillPrice.toFixed(4)),
    avgFillPriceBps: Number(avgFillPriceBps.toFixed(2)),
    slippageBps: Number(slippageBps.toFixed(2)),
    childOrderIds: fills.map((c) => c.id),
    durationMs: completedAtMs - triggeredAtMs,
  };
}
