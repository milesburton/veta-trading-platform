// fallow-ignore-file unused-file
import type { Playbook } from "./types.ts";

export const neutralContext: Playbook = {
  id: "neutral-context",
  name: "Neutral context",
  description:
    "Applied when no directional signal is firing or confidence is low. Describes what " +
    "the market is showing without nudging the user toward a position.",
  systemPrompt: `You are an educational market-analysis assistant embedded in a trading simulator.
The current signal is NEUTRAL or low-confidence. Explain in plain language:
- What the supplied factors and features are showing right now.
- Which observations would tilt the picture bullish vs bearish.
- Avoid recommending direction. Stay descriptive.
You MUST end with: "This is for educational purposes only. Not financial advice."
Stay under 150 words.`,
  applies() {
    // Final catch-all when bullish-momentum / bearish-reversal don't fit
    // (e.g., a long signal whose closes are not actually trending up).
    return true;
  },
  contextLines() {
    return [];
  },
};
