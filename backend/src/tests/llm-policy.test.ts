import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import {
  canAutoTrigger,
  isPolicyEnabled,
  loadPolicy,
  meetsConvictionThreshold,
} from "../llm-advisory/policy.ts";

Deno.test("[llm-policy] loadPolicy: all defaults are safe when no env vars set", () => {
  // Unset all LLM vars before testing defaults
  const varsToDelete = [
    "LLM_ENABLED",
    "LLM_PROVIDER",
    "LLM_MODEL_ID",
    "LLM_OLLAMA_BASE_URL",
    "LLM_MAX_CONCURRENT_JOBS",
    "LLM_MAX_NOTE_AGE_MS",
    "LLM_SIGNAL_CONVICTION_THRESHOLD",
    "LLM_CONFIDENCE_THRESHOLD",
    "LLM_DEDUPE_WINDOW_MS",
    "LLM_AUTO_TRIGGER_ENABLED",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const v of varsToDelete) {
    saved[v] = Deno.env.get(v);
    Deno.env.delete(v);
  }
  try {
    const policy = loadPolicy();
    assertEquals(policy.enabled, false, "enabled must default to false");
    assertEquals(policy.provider, "mock");
    assertEquals(policy.modelId, "mock-v1");
    assertEquals(policy.maxConcurrentJobs, 1);
    assertEquals(policy.maxNoteAgeMs, 300_000);
    assertEquals(policy.signalConvictionThreshold, 0.7);
    assertEquals(policy.confidenceThreshold, 0.8);
    assertEquals(policy.dedupeWindowMs, 60_000);
    assertEquals(policy.autoTriggerEnabled, true);
  } finally {
    for (const v of varsToDelete) {
      if (saved[v] !== undefined) Deno.env.set(v, saved[v]!);
    }
  }
});

Deno.test("[llm-policy] loadPolicy: env overrides are parsed correctly", () => {
  Deno.env.set("LLM_ENABLED", "true");
  Deno.env.set("LLM_PROVIDER", "ollama");
  Deno.env.set("LLM_MAX_NOTE_AGE_MS", "600000");
  Deno.env.set("LLM_SIGNAL_CONVICTION_THRESHOLD", "0.5");
  try {
    const policy = loadPolicy();
    assertEquals(policy.enabled, true);
    assertEquals(policy.provider, "ollama");
    assertEquals(policy.maxNoteAgeMs, 600_000);
    assertEquals(policy.signalConvictionThreshold, 0.5);
  } finally {
    Deno.env.delete("LLM_ENABLED");
    Deno.env.delete("LLM_PROVIDER");
    Deno.env.delete("LLM_MAX_NOTE_AGE_MS");
    Deno.env.delete("LLM_SIGNAL_CONVICTION_THRESHOLD");
  }
});

Deno.test("[llm-policy] isPolicyEnabled: returns false when disabled", () => {
  const policy = {
    enabled: false,
    workerEnabled: false,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: true,
  };
  assertEquals(isPolicyEnabled(policy), false);
});

Deno.test("[llm-policy] isPolicyEnabled: returns true when enabled", () => {
  const policy = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: true,
  };
  assertEquals(isPolicyEnabled(policy), true);
});

Deno.test("[llm-policy] meetsConvictionThreshold: returns false for low-conviction signal", () => {
  const policy = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: true,
  };
  assert(!meetsConvictionThreshold(policy, { score: 0.3, confidence: 0.9 }));
});

Deno.test("[llm-policy] meetsConvictionThreshold: returns true for high-conviction signal", () => {
  const policy = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: true,
  };
  assert(meetsConvictionThreshold(policy, { score: 0.8, confidence: 0.9 }));
});

Deno.test("[llm-policy] meetsConvictionThreshold: returns false when confidence below threshold", () => {
  const policy = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: true,
  };
  assert(!meetsConvictionThreshold(policy, { score: 0.8, confidence: 0.5 }));
});

Deno.test("[llm-policy] canAutoTrigger: respects autoTriggerEnabled=false", () => {
  const policy = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: false,
  };
  assertEquals(canAutoTrigger(policy), false);
});

Deno.test("[llm-policy] canAutoTrigger: returns false when disabled even with autoTriggerEnabled=true", () => {
  const policy = {
    enabled: false,
    workerEnabled: false,
    triggerMode: "manual" as const,
    provider: "mock",
    modelId: "mock-v1",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 300_000,
    minRefreshMinutes: 60,
    workerIdleTimeoutSeconds: 300,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.8,
    dedupeWindowMs: 60_000,
    autoTriggerEnabled: true,
  };
  assertEquals(canAutoTrigger(policy), false);
});
