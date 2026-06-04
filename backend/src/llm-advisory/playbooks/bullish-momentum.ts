// fallow-ignore-file unused-file
import type { Playbook } from "./types.ts";

export const bullishMomentum: Playbook = {
  id: "bullish-momentum",
  name: "Bullish momentum",
  description:
    "Applied when the signal is UP and recent closes show an unbroken upward trajectory. " +
    "Frames the commentary around what is driving the move and what would invalidate it.",
  systemPrompt: `You are an educational market-analysis assistant embedded in a trading simulator.
The current signal is BULLISH. Explain in plain language:
- Which of the supplied factors are pushing the score positive.
- Whether recent price action supports or contradicts the signal.
- What concrete observation (e.g., a level break, a volume drop) would invalidate the bullish thesis.
You MUST end with: "This is for educational purposes only. Not financial advice."
Stay under 150 words.`,
  applies(ctx) {
    if (ctx.signal.direction !== "long") return false;
    if (typeof ctx.signal.confidence === "number" && ctx.signal.confidence < 0.4) return false;
    const closes = ctx.recentCloses;
    if (closes.length < 3) return false;
    const last = closes[closes.length - 1];
    const first = closes[0];
    return last > first;
  },
  contextLines(ctx) {
    const closes = ctx.recentCloses;
    const last = closes[closes.length - 1];
    const first = closes[0];
    if (!Number.isFinite(last) || !Number.isFinite(first) || first === 0) return [];
    const pctMove = ((last - first) / first) * 100;
    return [
      `Recent close trajectory: ${pctMove >= 0 ? "+" : ""}${pctMove.toFixed(2)}% over ${closes.length} bars`,
    ];
  },
};
