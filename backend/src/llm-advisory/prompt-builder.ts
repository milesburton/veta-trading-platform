import type {
  FeatureVector,
  Signal,
  TradeRecommendation,
} from "@veta/types/intelligence";

export const SYSTEM_PROMPT =
  `You are an educational market analysis assistant embedded in a trading simulator.
Your role is to provide concise, objective commentary on market signals and feature data.
You MUST always include the disclaimer: "This is for educational purposes only. Not financial advice."
Focus on explaining what the data shows, not on recommending specific trades.
Keep responses under 150 words. Use plain language.`;

export async function computeSystemPromptHash(): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SYSTEM_PROMPT);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function fmt(n: number | null | undefined, places: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(places);
}

export function buildPrompt(
  symbol: string,
  signal: Signal,
  fv: FeatureVector | null,
  rec: TradeRecommendation | null,
  recentCloses: number[],
): string {
  const topFactors = [...(signal.factors ?? [])]
    .filter((f) => typeof f.contribution === "number" && Number.isFinite(f.contribution))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 2)
    .map((f) => `${f.name}(${f.contribution >= 0 ? "+" : ""}${fmt(f.contribution, 3)})`)
    .join(", ");

  const confidencePct = typeof signal.confidence === "number" && Number.isFinite(signal.confidence)
    ? `${(signal.confidence * 100).toFixed(0)}%`
    : "—";

  const lines: string[] = [
    `Symbol: ${symbol}`,
    `Signal: ${signal.direction} | score ${fmt(signal.score, 3)} | confidence ${confidencePct}`,
    `Top factors: ${topFactors || "—"}`,
  ];

  if (fv) {
    lines.push(
      `Features: momentum=${fmt(fv.momentum, 4)}, relVol=${fmt(fv.relativeVolume, 2)}, ` +
        `realisedVol=${fmt(fv.realisedVol, 4)}, sectorRS=${fmt(fv.sectorRelativeStrength, 4)}, ` +
        `eventScore=${fmt(fv.eventScore, 2)}, newsVel=${fmt(fv.newsVelocity, 1)}, ` +
        `sentDelta=${fmt(fv.sentimentDelta, 3)}`,
    );
  }

  if (rec) {
    const recConfidencePct =
      typeof rec.confidence === "number" && Number.isFinite(rec.confidence)
        ? `${(rec.confidence * 100).toFixed(0)}%`
        : "—";
    lines.push(
      `Recommendation: ${rec.action} | qty ${rec.suggestedQty ?? "—"} | confidence ${recConfidencePct}`,
      `Rationale: ${rec.rationale ?? "—"}`,
    );
  }

  if (recentCloses.length > 0) {
    lines.push(
      `Recent closes: ${recentCloses.slice(-5).map((v) => fmt(v, 2)).join(", ")}`,
    );
  }

  lines.push(
    "\nProvide a brief educational commentary on what these signals suggest.",
  );

  return lines.join("\n");
}
