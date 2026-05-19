// fallow-ignore-file unused-file
import type { Playbook } from "./types.ts";

export const bearishReversal: Playbook = {
  id: "bearish-reversal",
  name: "Bearish reversal",
  description:
    "Applied when the signal is DOWN. Highlights the deterioration in factors and what would " +
    "constitute a reversal back to neutral or bullish.",
  systemPrompt: `You are an educational market-analysis assistant embedded in a trading simulator.
The current signal is BEARISH. Explain in plain language:
- Which factors have deteriorated and by how much.
- Whether the move looks like trend-continuation or capitulation.
- What concrete observation (e.g., a volume capitulation, a base-building pattern) would mark a possible reversal.
You MUST end with: "This is for educational purposes only. Not financial advice."
Stay under 150 words.`,
  applies(ctx) {
    if (ctx.signal.direction !== "short") return false;
    if (typeof ctx.signal.confidence === "number" && ctx.signal.confidence < 0.4) return false;
    return true;
  },
  contextLines(ctx) {
    const closes = ctx.recentCloses;
    if (closes.length < 3) return [];
    const last = closes[closes.length - 1];
    const high = Math.max(...closes);
    if (!Number.isFinite(last) || !Number.isFinite(high) || high === 0) return [];
    const drawdownPct = ((last - high) / high) * 100;
    return [`Drawdown from recent high: ${drawdownPct.toFixed(2)}% over ${closes.length} bars`];
  },
};
