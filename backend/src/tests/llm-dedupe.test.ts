import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { JobStore } from "../llm-advisory/job-store.ts";
import { computeContextHash, shouldEnqueueJob } from "../llm-advisory/dedupe.ts";
import { AdvisoryTriggerReason } from "../types/llm-advisory.ts";
import type { LlmPolicy } from "../types/llm-advisory.ts";

const ENABLED_POLICY: LlmPolicy = {
  enabled: true,
  provider: "mock",
  modelId: "mock-v1",
  ollamaBaseUrl: "http://localhost:11434",
  maxConcurrentJobs: 1,
  maxNoteAgeMs: 300_000,
  signalConvictionThreshold: 0.7,
  confidenceThreshold: 0.8,
  dedupeWindowMs: 60_000,
  autoTriggerEnabled: true,
};

const DISABLED_POLICY: LlmPolicy = { ...ENABLED_POLICY, enabled: false };

function makeStore(): JobStore {
  return new JobStore(":memory:");
}

function makeJob(overrides: Partial<{ symbol: string; contextHash: string; priority: number; status: string; createdAt: number }> = {}) {
  return {
    symbol: overrides.symbol ?? "AAPL",
    triggerReason: AdvisoryTriggerReason.HIGH_CONVICTION_SIGNAL,
    status: (overrides.status ?? "queued") as import("../types/llm-advisory.ts").LlmJobStatus,
    contextHash: overrides.contextHash ?? "aabbccdd00112233",
    priority: overrides.priority ?? 0,
    requestedBy: null,
    createdAt: overrides.createdAt ?? Date.now(),
    claimedAt: null,
    completedAt: null,
    workerSessionId: null,
    errorMessage: null,
    retryCount: 0,
  };
}

Deno.test("[llm-dedupe] computeContextHash: same inputs produce same hash", async () => {
  const h1 = await computeContextHash(["AAPL", "long", "0.8"]);
  const h2 = await computeContextHash(["AAPL", "long", "0.8"]);
  assertEquals(h1, h2);
});

Deno.test("[llm-dedupe] computeContextHash: different inputs produce different hashes", async () => {
  const h1 = await computeContextHash(["AAPL", "long", "0.8"]);
  const h2 = await computeContextHash(["AAPL", "short", "0.8"]);
  assert(h1 !== h2, "Hashes should differ for different inputs");
});

Deno.test("[llm-dedupe] computeContextHash: returns 16-char hex string", async () => {
  const h = await computeContextHash(["TEST"]);
  assertEquals(h.length, 16);
  assert(/^[0-9a-f]+$/.test(h), "Hash should be lowercase hex");
});

Deno.test("[llm-dedupe] shouldEnqueueJob: allows enqueue when no recent job exists", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["TEST", "long"]);
  const result = shouldEnqueueJob(store, hash, ENABLED_POLICY);
  assert(result, "Should allow enqueue on empty DB");
  store.close();
});

Deno.test("[llm-dedupe] shouldEnqueueJob: prevents enqueue within dedupeWindowMs", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["AAPL", "long"]);
  store.insertJob(makeJob({ contextHash: hash, createdAt: Date.now() }));
  const result = shouldEnqueueJob(store, hash, ENABLED_POLICY);
  assert(!result, "Should block duplicate within window");
  store.close();
});

Deno.test("[llm-dedupe] shouldEnqueueJob: allows enqueue after dedupeWindowMs expires", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["AAPL", "long"]);
  store.insertJob(makeJob({ contextHash: hash, createdAt: Date.now() - 90_000 }));
  const result = shouldEnqueueJob(store, hash, ENABLED_POLICY);
  assert(result, "Should allow enqueue after window expires");
  store.close();
});

Deno.test("[llm-dedupe] shouldEnqueueJob: returns false when policy disabled", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["TEST"]);
  const result = shouldEnqueueJob(store, hash, DISABLED_POLICY);
  assert(!result, "Should block when policy is disabled");
  store.close();
});

Deno.test("[llm-dedupe] JobStore.claimNextJob: returns highest priority job first", () => {
  const store = makeStore();
  store.insertJob(makeJob({ symbol: "LOW", priority: -1 }));
  store.insertJob(makeJob({ symbol: "MID", priority: 0 }));
  store.insertJob(makeJob({ symbol: "HIGH", priority: 1 }));
  const claimed = store.claimNextJob("test-session");
  assertExists(claimed);
  assertEquals(claimed.symbol, "HIGH");
  assertEquals(claimed.priority, 1);
  store.close();
});

Deno.test("[llm-dedupe] JobStore.claimNextJob: returns null when no queued jobs", () => {
  const store = makeStore();
  const claimed = store.claimNextJob("test-session");
  assertEquals(claimed, null);
  store.close();
});

Deno.test("[llm-dedupe] JobStore.claimNextJob: sets status to running", () => {
  const store = makeStore();
  const jobId = store.insertJob(makeJob());
  const claimed = store.claimNextJob("test-session");
  assertExists(claimed);
  assertEquals(claimed.id, jobId);
  assertEquals(claimed.status, "running");
  assertEquals(claimed.workerSessionId, "test-session");
  store.close();
});

Deno.test("[llm-dedupe] JobStore.sweepStuckJobs: resets running jobs older than maxAge", () => {
  const store = makeStore();
  const jobId = store.insertJob(makeJob());
  store.claimNextJob("test-session");
  // Pass maxRunningAgeMs=0 so any running job (claimed_at <= now) counts as stuck
  const swept = store.sweepStuckJobs(-1_000_000);
  assertEquals(swept, 1);
  const job = store.getJob(jobId);
  assertExists(job);
  assertEquals(job.status, "queued");
  store.close();
});

Deno.test("[llm-dedupe] JobStore.hasRecentJob: correctly gates on time window", () => {
  const store = makeStore();
  const hash = "aabbccdd11223344";
  store.insertJob(makeJob({ contextHash: hash, createdAt: Date.now() - 30_000 }));
  assert(store.hasRecentJob(hash, 60_000), "Should find job within 60s window");
  assert(!store.hasRecentJob(hash, 20_000), "Should not find job outside 20s window");
  store.close();
});

Deno.test("[llm-dedupe] JobStore.getPendingJobCount: counts queued and running jobs", () => {
  const store = makeStore();
  store.insertJob(makeJob({ symbol: "A" }));
  store.insertJob(makeJob({ symbol: "B" }));
  assertEquals(store.getPendingJobCount(), 2);
  store.claimNextJob("s");
  assertEquals(store.getPendingJobCount(), 2);
  store.close();
});
