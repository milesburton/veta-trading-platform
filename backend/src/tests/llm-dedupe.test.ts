import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { computeContextHash, shouldEnqueueJob } from "../llm-advisory/dedupe.ts";
import { AdvisoryTriggerReason } from "../types/llm-advisory.ts";
import type { LlmJob, LlmJobStatus } from "../types/llm-advisory.ts";
import type { JobStore } from "../llm-advisory/job-store.ts";
import type { LlmPolicy } from "../types/llm-advisory.ts";

const ENABLED_POLICY: LlmPolicy = {
  enabled: true,
  workerEnabled: true,
  triggerMode: "manual",
  provider: "mock",
  modelId: "mock-v1",
  ollamaBaseUrl: "http://localhost:11434",
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

const DISABLED_POLICY: LlmPolicy = { ...ENABLED_POLICY, enabled: false };

/** In-memory JobStore for unit tests — no DB required */
function makeStore(): JobStore & { _jobs: Map<string, LlmJob> } {
  const jobs = new Map<string, LlmJob>();

  return {
    _jobs: jobs,

    insertJob(job): Promise<string> {
      const id = crypto.randomUUID();
      jobs.set(id, { id, ...job } as LlmJob);
      return Promise.resolve(id);
    },

    claimNextJob(workerSessionId): Promise<LlmJob | null> {
      const queued = [...jobs.values()]
        .filter((j) => j.status === "queued")
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
      if (queued.length === 0) return Promise.resolve(null);
      const job = queued[0];
      const updated: LlmJob = { ...job, status: "running", claimedAt: Date.now(), workerSessionId };
      jobs.set(job.id, updated);
      return Promise.resolve(updated);
    },

    updateJobStatus(jobId, status, fields): Promise<void> {
      const job = jobs.get(jobId);
      if (job) {
        jobs.set(jobId, {
          ...job,
          status,
          completedAt: fields?.completedAt ?? job.completedAt,
          errorMessage: fields?.errorMessage ?? job.errorMessage,
          retryCount: fields?.retryCount ?? job.retryCount,
        });
      }
      return Promise.resolve();
    },

    getJob(jobId): Promise<LlmJob | null> {
      return Promise.resolve(jobs.get(jobId) ?? null);
    },

    getJobsBySymbol(symbol, limit = 20): Promise<LlmJob[]> {
      return Promise.resolve(
        [...jobs.values()]
          .filter((j) => j.symbol === symbol)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit),
      );
    },

    getPendingJobCount(): Promise<number> {
      return Promise.resolve(
        [...jobs.values()].filter((j) => j.status === "queued" || j.status === "running").length,
      );
    },

    hasRecentJob(contextHash, windowMs): Promise<boolean> {
      const cutoff = Date.now() - windowMs;
      return Promise.resolve(
        [...jobs.values()].some(
          (j) => j.contextHash === contextHash && j.createdAt > cutoff && j.status !== "cancelled",
        ),
      );
    },

    cancelJobsForSymbol(symbol): Promise<number> {
      let count = 0;
      for (const [id, job] of jobs) {
        if (job.symbol === symbol && job.status === "queued") {
          jobs.set(id, { ...job, status: "cancelled" });
          count++;
        }
      }
      return Promise.resolve(count);
    },

    insertNote(): Promise<string> { return Promise.resolve(crypto.randomUUID()); },
    getLatestNote(): Promise<null> { return Promise.resolve(null); },
    insertPromptAudit(): Promise<void> { return Promise.resolve(); },
    insertResponseAudit(): Promise<void> { return Promise.resolve(); },
    insertWorkerSession(): Promise<string> { return Promise.resolve(crypto.randomUUID()); },
    updateWorkerSession(): Promise<void> { return Promise.resolve(); },

    sweepStuckJobs(maxRunningAgeMs): Promise<number> {
      const cutoff = Date.now() - maxRunningAgeMs;
      let count = 0;
      for (const [id, job] of jobs) {
        if (job.status === "running" && (job.claimedAt ?? 0) < cutoff) {
          jobs.set(id, { ...job, status: "queued", claimedAt: null, workerSessionId: null });
          count++;
        }
      }
      return Promise.resolve(count);
    },

    pruneOldData(): Promise<void> { return Promise.resolve(); },
  };
}

function makeJobInput(overrides: Partial<{ symbol: string; contextHash: string; priority: number; status: LlmJobStatus; createdAt: number }> = {}) {
  return {
    symbol: overrides.symbol ?? "AAPL",
    triggerReason: AdvisoryTriggerReason.HIGH_CONVICTION_SIGNAL,
    status: (overrides.status ?? "queued") as LlmJobStatus,
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
  const result = await shouldEnqueueJob(store, hash, ENABLED_POLICY);
  assert(result, "Should allow enqueue on empty store");
});

Deno.test("[llm-dedupe] shouldEnqueueJob: prevents enqueue within dedupeWindowMs", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["AAPL", "long"]);
  await store.insertJob(makeJobInput({ contextHash: hash, createdAt: Date.now() }));
  const result = await shouldEnqueueJob(store, hash, ENABLED_POLICY);
  assert(!result, "Should block duplicate within window");
});

Deno.test("[llm-dedupe] shouldEnqueueJob: allows enqueue after dedupeWindowMs expires", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["AAPL", "long"]);
  await store.insertJob(makeJobInput({ contextHash: hash, createdAt: Date.now() - 90_000 }));
  const result = await shouldEnqueueJob(store, hash, ENABLED_POLICY);
  assert(result, "Should allow enqueue after window expires");
});

Deno.test("[llm-dedupe] shouldEnqueueJob: returns false when policy disabled", async () => {
  const store = makeStore();
  const hash = await computeContextHash(["TEST"]);
  const result = await shouldEnqueueJob(store, hash, DISABLED_POLICY);
  assert(!result, "Should block when policy is disabled");
});

Deno.test("[llm-dedupe] JobStore.claimNextJob: returns highest priority job first", async () => {
  const store = makeStore();
  await store.insertJob(makeJobInput({ symbol: "LOW", priority: -1 }));
  await store.insertJob(makeJobInput({ symbol: "MID", priority: 0 }));
  await store.insertJob(makeJobInput({ symbol: "HIGH", priority: 1 }));
  const claimed = await store.claimNextJob("test-session");
  assertExists(claimed);
  assertEquals(claimed.symbol, "HIGH");
  assertEquals(claimed.priority, 1);
});

Deno.test("[llm-dedupe] JobStore.claimNextJob: returns null when no queued jobs", async () => {
  const store = makeStore();
  const claimed = await store.claimNextJob("test-session");
  assertEquals(claimed, null);
});

Deno.test("[llm-dedupe] JobStore.claimNextJob: sets status to running", async () => {
  const store = makeStore();
  const jobId = await store.insertJob(makeJobInput());
  const claimed = await store.claimNextJob("test-session");
  assertExists(claimed);
  assertEquals(claimed.id, jobId);
  assertEquals(claimed.status, "running");
  assertEquals(claimed.workerSessionId, "test-session");
});

Deno.test("[llm-dedupe] JobStore.sweepStuckJobs: resets running jobs older than maxAge", async () => {
  const store = makeStore();
  const jobId = await store.insertJob(makeJobInput());
  await store.claimNextJob("test-session");
  // Pass a future cutoff so that any claimed_at (which is ~now) is before it
  const swept = await store.sweepStuckJobs(-1_000_000);
  assertEquals(swept, 1);
  const job = await store.getJob(jobId);
  assertExists(job);
  assertEquals(job.status, "queued");
});

Deno.test("[llm-dedupe] JobStore.hasRecentJob: correctly gates on time window", async () => {
  const store = makeStore();
  const hash = "aabbccdd11223344";
  await store.insertJob(makeJobInput({ contextHash: hash, createdAt: Date.now() - 30_000 }));
  assert(await store.hasRecentJob(hash, 60_000), "Should find job within 60s window");
  assert(!(await store.hasRecentJob(hash, 20_000)), "Should not find job outside 20s window");
});

Deno.test("[llm-dedupe] JobStore.getPendingJobCount: counts queued and running jobs", async () => {
  const store = makeStore();
  await store.insertJob(makeJobInput({ symbol: "A" }));
  await store.insertJob(makeJobInput({ symbol: "B" }));
  assertEquals(await store.getPendingJobCount(), 2);
  await store.claimNextJob("s");
  assertEquals(await store.getPendingJobCount(), 2);
});
