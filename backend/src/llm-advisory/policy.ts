import type { LlmPolicy } from "../types/llm-advisory.ts";

export function loadPolicy(): LlmPolicy {
  return {
    enabled: Deno.env.get("LLM_ADVISORY_ENABLED") === "true",
    provider: Deno.env.get("LLM_PROVIDER") ?? "mock",
    modelId: Deno.env.get("LLM_MODEL_ID") ?? "mock-v1",
    ollamaBaseUrl: Deno.env.get("LLM_OLLAMA_BASE_URL") ?? "http://localhost:11434",
    maxConcurrentJobs: Number(Deno.env.get("LLM_MAX_CONCURRENT_JOBS") ?? "1"),
    maxNoteAgeMs: Number(Deno.env.get("LLM_MAX_NOTE_AGE_MS") ?? "300000"),
    signalConvictionThreshold: Number(Deno.env.get("LLM_SIGNAL_CONVICTION_THRESHOLD") ?? "0.7"),
    confidenceThreshold: Number(Deno.env.get("LLM_CONFIDENCE_THRESHOLD") ?? "0.8"),
    dedupeWindowMs: Number(Deno.env.get("LLM_DEDUPE_WINDOW_MS") ?? "60000"),
    autoTriggerEnabled: Deno.env.get("LLM_AUTO_TRIGGER_ENABLED") !== "false",
  };
}

export function isPolicyEnabled(policy: LlmPolicy): boolean {
  return policy.enabled;
}

export function canAutoTrigger(policy: LlmPolicy): boolean {
  return policy.enabled && policy.autoTriggerEnabled;
}

export function meetsConvictionThreshold(
  policy: LlmPolicy,
  signal: { score: number; confidence: number },
): boolean {
  return (
    Math.abs(signal.score) > policy.signalConvictionThreshold &&
    signal.confidence > policy.confidenceThreshold
  );
}
