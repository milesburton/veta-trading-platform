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

export function buildPrompt(
  symbol: string,
  signal: Signal,
  fv: FeatureVector | null,
  rec: TradeRecommendation | null,
  recentCloses: number[],
): string {
  const topFactors = [...signal.factors]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 2)
    .map((f) =>
      `${f.name}(${f.contribution >= 0 ? "+" : ""}${f.contribution.toFixed(3)})`
    )
    .join(", ");

  const lines: string[] = [
    `Symbol: ${symbol}`,
    `Signal: ${signal.direction} | score ${
      signal.score.toFixed(3)
    } | confidence ${(signal.confidence * 100).toFixed(0)}%`,
    `Top factors: ${topFactors}`,
  ];

  if (fv) {
    lines.push(
      `Features: momentum=${fv.momentum.toFixed(4)}, relVol=${
        fv.relativeVolume.toFixed(2)
      }, ` +
        `realisedVol=${fv.realisedVol.toFixed(4)}, sectorRS=${
          fv.sectorRelativeStrength.toFixed(4)
        }, ` +
        `eventScore=${fv.eventScore.toFixed(2)}, newsVel=${
          fv.newsVelocity.toFixed(1)
        }, ` +
        `sentDelta=${fv.sentimentDelta.toFixed(3)}`,
    );
  }

  if (rec) {
    lines.push(
      `Recommendation: ${rec.action} | qty ${rec.suggestedQty} | confidence ${
        (rec.confidence * 100).toFixed(0)
      }%`,
      `Rationale: ${rec.rationale}`,
    );
  }

  if (recentCloses.length > 0) {
    lines.push(
      `Recent closes: ${
        recentCloses.slice(-5).map((v) => v.toFixed(2)).join(", ")
      }`,
    );
  }

  lines.push(
    "\nProvide a brief educational commentary on what these signals suggest.",
  );

  return lines.join("\n");
}
