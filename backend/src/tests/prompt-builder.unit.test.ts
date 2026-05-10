import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "jsr:@std/assert@0.217";
import {
  buildPrompt,
  computeSystemPromptHash,
  SYSTEM_PROMPT,
} from "../llm-advisory/prompt-builder.ts";
import type {
  FeatureVector,
  Signal,
  TradeRecommendation,
} from "../types/intelligence.ts";

const baseSignal: Signal = {
  symbol: "AAPL",
  score: 0.85,
  direction: "long",
  confidence: 0.9,
  ts: Date.now(),
  factors: [
    { name: "momentum", weight: 0.4, contribution: 0.32 },
    { name: "relativeVolume", weight: 0.3, contribution: -0.18 },
    { name: "realisedVol", weight: 0.2, contribution: 0.05 },
  ],
};

Deno.test("[prompt-builder] SYSTEM_PROMPT contains the educational disclaimer", () => {
  assertStringIncludes(SYSTEM_PROMPT, "educational purposes only");
  assertStringIncludes(SYSTEM_PROMPT, "Not financial advice");
});

Deno.test("[prompt-builder] computeSystemPromptHash is stable (SHA-256 of fixed string)", async () => {
  const a = await computeSystemPromptHash();
  const b = await computeSystemPromptHash();
  assertEquals(a, b);
  assertMatch(a, /^[0-9a-f]{64}$/);
});

Deno.test("[prompt-builder] buildPrompt with signal-only returns lines for symbol, signal, top factors", () => {
  const out = buildPrompt("AAPL", baseSignal, null, null, []);
  assertStringIncludes(out, "Symbol: AAPL");
  assertStringIncludes(out, "Signal: long");
  assertStringIncludes(out, "score 0.850");
  assertStringIncludes(out, "confidence 90%");
});

Deno.test("[prompt-builder] buildPrompt picks the top 2 factors by absolute contribution", () => {
  const out = buildPrompt("AAPL", baseSignal, null, null, []);
  assertStringIncludes(out, "momentum(+0.320)");
  assertStringIncludes(out, "relativeVolume(-0.180)");
  assert(!out.includes("realisedVol("));
});

Deno.test("[prompt-builder] buildPrompt renders feature vector when provided", () => {
  const fv: FeatureVector = {
    symbol: "AAPL",
    ts: Date.now(),
    momentum: 0.0123,
    relativeVolume: 1.45,
    realisedVol: 0.2456,
    sectorRelativeStrength: -0.0034,
    eventScore: 2.5,
    newsVelocity: 12.3,
    sentimentDelta: 0.075,
  };
  const out = buildPrompt("AAPL", baseSignal, fv, null, []);
  assertStringIncludes(out, "momentum=0.0123");
  assertStringIncludes(out, "relVol=1.45");
  assertStringIncludes(out, "realisedVol=0.2456");
  assertStringIncludes(out, "sectorRS=-0.0034");
  assertStringIncludes(out, "eventScore=2.50");
  assertStringIncludes(out, "newsVel=12.3");
  assertStringIncludes(out, "sentDelta=0.075");
});

Deno.test("[prompt-builder] buildPrompt renders recommendation when provided", () => {
  const rec: TradeRecommendation = {
    symbol: "AAPL",
    action: "buy",
    suggestedQty: 100,
    rationale: "Strong momentum",
    signalScore: 0.85,
    confidence: 0.92,
    ts: Date.now(),
  };
  const out = buildPrompt("AAPL", baseSignal, null, rec, []);
  assertStringIncludes(out, "Recommendation: buy");
  assertStringIncludes(out, "qty 100");
  assertStringIncludes(out, "confidence 92%");
  assertStringIncludes(out, "Rationale: Strong momentum");
});

Deno.test("[prompt-builder] buildPrompt shows last 5 closes when many provided", () => {
  const closes = [100, 101, 102, 103, 104, 105, 106, 107];
  const out = buildPrompt("AAPL", baseSignal, null, null, closes);
  assertStringIncludes(out, "103.00, 104.00, 105.00, 106.00, 107.00");
  assert(!out.includes("100.00"));
});

Deno.test("[prompt-builder] buildPrompt omits the closes line when array empty", () => {
  const out = buildPrompt("AAPL", baseSignal, null, null, []);
  assert(!out.includes("Recent closes"));
});

Deno.test("[prompt-builder] buildPrompt always ends with the educational commentary line", () => {
  const out = buildPrompt("AAPL", baseSignal, null, null, []);
  assertStringIncludes(out, "educational commentary");
});

Deno.test("[prompt-builder] buildPrompt: short direction when score is negative", () => {
  const shortSignal: Signal = { ...baseSignal, direction: "short", score: -0.7 };
  const out = buildPrompt("AAPL", shortSignal, null, null, []);
  assertStringIncludes(out, "Signal: short");
  assertStringIncludes(out, "score -0.700");
});
