import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  canAutoTrigger,
  canTriggerFromUi,
  isIdleWindowOpen,
  isPolicyEnabled,
  isWithinAllowedHours,
  isWorkerAllowed,
  loadPolicy,
  meetsConvictionThreshold,
} from "../llm-advisory/policy.ts";
import type { LlmPolicy, LlmTriggerMode } from "../types/llm-advisory.ts";

function policy(overrides: Partial<LlmPolicy> = {}): LlmPolicy {
  return {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual" as LlmTriggerMode,
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
    ...overrides,
  };
}

test("[llm-policy] loadPolicy: all defaults are safe when no env vars set", () => {
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
    saved[v] = process.env[v];
    delete process.env[v];
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
      const value = saved[v];
      if (value !== undefined) process.env[v] = value;
    }
  }
});

test("[llm-policy] loadPolicy: env overrides are parsed correctly", () => {
  process.env["LLM_ENABLED"] = "true";
  process.env["LLM_PROVIDER"] = "ollama";
  process.env["LLM_MAX_NOTE_AGE_MS"] = "600000";
  process.env["LLM_SIGNAL_CONVICTION_THRESHOLD"] = "0.5";
  try {
    const policy = loadPolicy();
    assertEquals(policy.enabled, true);
    assertEquals(policy.provider, "ollama");
    assertEquals(policy.maxNoteAgeMs, 600_000);
    assertEquals(policy.signalConvictionThreshold, 0.5);
  } finally {
    delete process.env["LLM_ENABLED"];
    delete process.env["LLM_PROVIDER"];
    delete process.env["LLM_MAX_NOTE_AGE_MS"];
    delete process.env["LLM_SIGNAL_CONVICTION_THRESHOLD"];
  }
});

test("[llm-policy] isPolicyEnabled: returns false when disabled", () => {
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

test("[llm-policy] isPolicyEnabled: returns true when enabled", () => {
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

test("[llm-policy] meetsConvictionThreshold: returns false for low-conviction signal", () => {
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

test("[llm-policy] meetsConvictionThreshold: returns true for high-conviction signal", () => {
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

test("[llm-policy] meetsConvictionThreshold: returns false when confidence below threshold", () => {
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

test("[llm-policy] canAutoTrigger: respects autoTriggerEnabled=false", () => {
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

test("[llm-policy] canAutoTrigger: returns false when disabled even with autoTriggerEnabled=true", () => {
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

test("[llm-policy] loadPolicy falls back to 'manual' when LLM_TRIGGER_MODE is invalid", () => {
  const prev = process.env.LLM_TRIGGER_MODE;
  process.env["LLM_TRIGGER_MODE"] = "nonsense-mode";
  try {
    const p = loadPolicy();
    assertEquals(p.triggerMode, "manual");
  } finally {
    if (prev !== undefined) process.env["LLM_TRIGGER_MODE"] = prev;
    else delete process.env["LLM_TRIGGER_MODE"];
  }
});

test("[llm-policy] loadPolicy accepts the valid trigger modes", () => {
  const prev = process.env.LLM_TRIGGER_MODE;
  try {
    for (const mode of ["disabled", "manual", "on-demand-ui", "scheduled-batch", "event-driven"]) {
      process.env["LLM_TRIGGER_MODE"] = mode;
      const p = loadPolicy();
      assertEquals(p.triggerMode, mode);
    }
  } finally {
    if (prev !== undefined) process.env["LLM_TRIGGER_MODE"] = prev;
    else delete process.env["LLM_TRIGGER_MODE"];
  }
});

test("[llm-policy] isWorkerAllowed requires both enabled and workerEnabled", () => {
  assertEquals(isWorkerAllowed(policy({ enabled: false, workerEnabled: true })), false);
  assertEquals(isWorkerAllowed(policy({ enabled: true, workerEnabled: false })), false);
  assertEquals(isWorkerAllowed(policy({ enabled: true, workerEnabled: true })), true);
});

test("[llm-policy] canAutoTrigger fires for event-driven and scheduled-batch", () => {
  assert(canAutoTrigger(policy({ triggerMode: "event-driven" })));
  assert(canAutoTrigger(policy({ triggerMode: "scheduled-batch" })));
  assertEquals(canAutoTrigger(policy({ triggerMode: "on-demand-ui" })), false);
  assertEquals(canAutoTrigger(policy({ triggerMode: "disabled" })), false);
});

test("[llm-policy] canTriggerFromUi requires enabled + non-disabled mode", () => {
  assertEquals(canTriggerFromUi(policy({ enabled: false })), false);
  assertEquals(canTriggerFromUi(policy({ triggerMode: "disabled" })), false);
  assert(canTriggerFromUi(policy({ triggerMode: "on-demand-ui" })));
  assert(canTriggerFromUi(policy({ triggerMode: "manual" })));
});

test("[llm-policy] isWithinAllowedHours returns true when allowedHours is null", () => {
  assert(isWithinAllowedHours(policy({ allowedHours: null })));
});

test("[llm-policy] isWithinAllowedHours returns true for malformed input", () => {
  assert(isWithinAllowedHours(policy({ allowedHours: "abc" })));
  assert(isWithinAllowedHours(policy({ allowedHours: "9" })));
  assert(isWithinAllowedHours(policy({ allowedHours: "9-x" })));
});

test("[llm-policy] isWithinAllowedHours wraps midnight for ranges where start > end", () => {
  const result = isWithinAllowedHours(policy({ allowedHours: "22-2" }));
  const hour = new Date().getUTCHours();
  const expected = hour >= 22 || hour < 2;
  assertEquals(result, expected);
});

test("[llm-policy] isWithinAllowedHours returns true for 0-24 all-day window", () => {
  assert(isWithinAllowedHours(policy({ allowedHours: "0-24" })));
});

test("[isIdleWindowOpen] closes once the deadline passes", () => {
  assertEquals(isIdleWindowOpen(1_000, 2_000, 1_999), true);
  assertEquals(isIdleWindowOpen(1_000, 2_000, 2_000), false);
});

test("[isIdleWindowOpen] a zero or negative timeout never closes", () => {
  assertEquals(isIdleWindowOpen(0, 0, Number.MAX_SAFE_INTEGER), true);
  assertEquals(isIdleWindowOpen(-1, 0, Number.MAX_SAFE_INTEGER), true);
});
