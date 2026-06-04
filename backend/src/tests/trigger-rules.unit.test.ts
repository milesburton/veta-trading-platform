import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  evaluateRecommendationTrigger,
  evaluateScenarioTrigger,
  evaluateSignalTrigger,
  evaluateStalenessRefreshTrigger,
  evaluateUiRequestTrigger,
} from "../llm-advisory/trigger-rules.ts";
import type { Signal, TradeRecommendation } from "../types/intelligence.ts";
import type { LlmPolicy } from "../types/llm-advisory.ts";
import { AdvisoryTriggerReason } from "../types/llm-advisory.ts";

const enabledPolicy: LlmPolicy = {
  enabled: true,
  workerEnabled: true,
  triggerMode: "event-driven",
  provider: "mock",
  modelId: "mock-v1",
  ollamaBaseUrl: "http://localhost:11434",
  maxConcurrentJobs: 1,
  maxNoteAgeMs: 300_000,
  minRefreshMinutes: 5,
  workerIdleTimeoutSeconds: 120,
  workerMaxJobsPerSession: 20,
  allowedHours: null,
  signalConvictionThreshold: 0.7,
  confidenceThreshold: 0.8,
  dedupeWindowMs: 60_000,
  autoTriggerEnabled: true,
};

const disabledPolicy: LlmPolicy = { ...enabledPolicy, enabled: false };

const highConvictionSignal: Signal = {
  symbol: "AAPL",
  score: 0.9,
  direction: "long",
  confidence: 0.95,
  factors: [],
  ts: Date.now(),
};

const lowConvictionSignal: Signal = {
  symbol: "AAPL",
  score: 0.5,
  direction: "long",
  confidence: 0.5,
  factors: [],
  ts: Date.now(),
};

Deno.test("[trigger-rules] signal trigger fires for high-conviction with event-driven policy", async () => {
  const t = await evaluateSignalTrigger(enabledPolicy, highConvictionSignal);
  assert(t);
  assertEquals(t?.symbol, "AAPL");
  assertEquals(t?.triggerReason, AdvisoryTriggerReason.HIGH_CONVICTION_SIGNAL);
  assertEquals(t?.priority, 0);
  assertEquals(t?.requestedBy, null);
  assert(t?.contextHash.length > 0);
});

Deno.test("[trigger-rules] signal trigger blocked when policy disabled", async () => {
  assertEquals(await evaluateSignalTrigger(disabledPolicy, highConvictionSignal), null);
});

Deno.test("[trigger-rules] signal trigger blocked for low-conviction signal", async () => {
  assertEquals(await evaluateSignalTrigger(enabledPolicy, lowConvictionSignal), null);
});

Deno.test("[trigger-rules] signal trigger blocked when triggerMode is on-demand-ui", async () => {
  const policy: LlmPolicy = { ...enabledPolicy, triggerMode: "on-demand-ui" };
  assertEquals(await evaluateSignalTrigger(policy, highConvictionSignal), null);
});

const recA: TradeRecommendation = {
  symbol: "AAPL",
  action: "buy",
  suggestedQty: 100,
  rationale: "x",
  signalScore: 0.85,
  confidence: 0.9,
  ts: Date.now(),
};
const recASell: TradeRecommendation = { ...recA, action: "sell" };
const recABig: TradeRecommendation = { ...recA, suggestedQty: 130 };

Deno.test("[trigger-rules] recommendation trigger fires when action changes", async () => {
  const t = await evaluateRecommendationTrigger(enabledPolicy, recASell, recA);
  assert(t);
  assertEquals(t?.triggerReason, AdvisoryTriggerReason.RECOMMENDATION_CHANGED);
});

Deno.test("[trigger-rules] recommendation trigger fires when qty changes by >20%", async () => {
  const t = await evaluateRecommendationTrigger(enabledPolicy, recABig, recA);
  assert(t);
});

Deno.test("[trigger-rules] recommendation trigger does not fire for <20% qty change", async () => {
  const minorBump = { ...recA, suggestedQty: 110 };
  assertEquals(await evaluateRecommendationTrigger(enabledPolicy, minorBump, recA), null);
});

Deno.test("[trigger-rules] recommendation trigger does not fire when prevRec absent (initial)", async () => {
  assertEquals(await evaluateRecommendationTrigger(enabledPolicy, recA, undefined), null);
});

Deno.test("[trigger-rules] recommendation trigger blocked when policy disabled", async () => {
  assertEquals(await evaluateRecommendationTrigger(disabledPolicy, recASell, recA), null);
});

Deno.test("[trigger-rules] UI request trigger fires when policy.enabled (regardless of mode)", async () => {
  const policy: LlmPolicy = { ...enabledPolicy, triggerMode: "on-demand-ui" };
  const t = await evaluateUiRequestTrigger(policy, "AAPL", "alice");
  assert(t);
  assertEquals(t?.symbol, "AAPL");
  assertEquals(t?.triggerReason, AdvisoryTriggerReason.UI_REQUEST);
  assertEquals(t?.priority, 1);
  assertEquals(t?.requestedBy, "alice");
});

Deno.test("[trigger-rules] UI request trigger blocked when disabled", async () => {
  assertEquals(await evaluateUiRequestTrigger(disabledPolicy, "AAPL", "alice"), null);
});

Deno.test("[trigger-rules] scenario trigger fires when enabled and produces stable hash regardless of factor order", async () => {
  const a = await evaluateScenarioTrigger(enabledPolicy, "AAPL", ["news", "macro"]);
  const b = await evaluateScenarioTrigger(enabledPolicy, "AAPL", ["macro", "news"]);
  assert(a);
  assert(b);
  assertEquals(a?.contextHash, b?.contextHash);
});

Deno.test("[trigger-rules] scenario trigger blocked when disabled", async () => {
  assertEquals(await evaluateScenarioTrigger(disabledPolicy, "AAPL", ["news"]), null);
});

Deno.test("[trigger-rules] staleness trigger fires when no prior note exists", async () => {
  const t = await evaluateStalenessRefreshTrigger(enabledPolicy, "AAPL", null);
  assert(t);
  assertEquals(t?.triggerReason, AdvisoryTriggerReason.STALENESS_REFRESH);
  assertEquals(t?.priority, -1);
});

Deno.test("[trigger-rules] staleness trigger blocked when latest note is fresh", async () => {
  const fresh = Date.now() - 1_000;
  assertEquals(await evaluateStalenessRefreshTrigger(enabledPolicy, "AAPL", fresh), null);
});

Deno.test("[trigger-rules] staleness trigger fires when latest note is older than maxNoteAgeMs", async () => {
  const old = Date.now() - enabledPolicy.maxNoteAgeMs - 10_000;
  const t = await evaluateStalenessRefreshTrigger(enabledPolicy, "AAPL", old);
  assert(t);
});

Deno.test("[trigger-rules] staleness trigger blocked when policy disabled", async () => {
  assertEquals(await evaluateStalenessRefreshTrigger(disabledPolicy, "AAPL", null), null);
});
