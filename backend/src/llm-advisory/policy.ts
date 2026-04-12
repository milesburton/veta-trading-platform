import type { LlmPolicy, LlmTriggerMode } from "@veta/types/llm-advisory";

export function loadPolicy(): LlmPolicy {
  const triggerModeRaw = Deno.env.get("LLM_TRIGGER_MODE") ?? "manual";
  const validModes: LlmTriggerMode[] = [
    "disabled",
    "manual",
    "on-demand-ui",
    "scheduled-batch",
    "event-driven",
  ];
  const triggerMode: LlmTriggerMode =
    validModes.includes(triggerModeRaw as LlmTriggerMode)
      ? (triggerModeRaw as LlmTriggerMode)
      : "manual";

  return {
    enabled: Deno.env.get("LLM_ENABLED") === "true",
    workerEnabled: Deno.env.get("LLM_WORKER_ENABLED") === "true",
    triggerMode,
    provider: Deno.env.get("LLM_PROVIDER") ?? "mock",
    modelId: Deno.env.get("LLM_MODEL_ID") ?? "mock-v1",
    ollamaBaseUrl: Deno.env.get("LLM_OLLAMA_BASE_URL") ??
      "http://localhost:11434",
    maxConcurrentJobs: Number(Deno.env.get("LLM_MAX_CONCURRENT_JOBS") ?? "1"),
    maxNoteAgeMs: Number(Deno.env.get("LLM_MAX_NOTE_AGE_MS") ?? "300000"),
    minRefreshMinutes: Number(Deno.env.get("LLM_MIN_REFRESH_MINUTES") ?? "5"),
    workerIdleTimeoutSeconds: Number(
      Deno.env.get("LLM_WORKER_IDLE_TIMEOUT_SECONDS") ?? "120",
    ),
    workerMaxJobsPerSession: Number(
      Deno.env.get("LLM_WORKER_MAX_JOBS_PER_SESSION") ?? "20",
    ),
    allowedHours: Deno.env.get("LLM_ALLOWED_HOURS") ?? null,
    signalConvictionThreshold: Number(
      Deno.env.get("LLM_SIGNAL_CONVICTION_THRESHOLD") ?? "0.7",
    ),
    confidenceThreshold: Number(
      Deno.env.get("LLM_CONFIDENCE_THRESHOLD") ?? "0.8",
    ),
    dedupeWindowMs: Number(Deno.env.get("LLM_DEDUPE_WINDOW_MS") ?? "60000"),
    autoTriggerEnabled: Deno.env.get("LLM_AUTO_TRIGGER_ENABLED") !== "false",
  };
}

export function isPolicyEnabled(policy: LlmPolicy): boolean {
  return policy.enabled;
}

export function isWorkerAllowed(policy: LlmPolicy): boolean {
  return policy.enabled && policy.workerEnabled;
}

export function canAutoTrigger(policy: LlmPolicy): boolean {
  if (!policy.enabled) return false;
  return (
    policy.triggerMode === "event-driven" ||
    policy.triggerMode === "scheduled-batch" ||
    (policy.triggerMode === "manual" && policy.autoTriggerEnabled)
  );
}

export function canTriggerFromUi(policy: LlmPolicy): boolean {
  if (!policy.enabled) return false;
  return policy.triggerMode !== "disabled";
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

export function isWithinAllowedHours(policy: LlmPolicy): boolean {
  if (!policy.allowedHours) return true;
  const now = new Date();
  const currentHour = now.getUTCHours();
  const parts = policy.allowedHours.split("-");
  if (parts.length !== 2) return true;
  const start = parseInt(parts[0], 10);
  const end = parseInt(parts[1], 10);
  if (isNaN(start) || isNaN(end)) return true;
  if (start <= end) return currentHour >= start && currentHour < end;
  return currentHour >= start || currentHour < end;
}
