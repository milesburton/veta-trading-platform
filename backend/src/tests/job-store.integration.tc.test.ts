import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { assert, assertEquals, assertGreater } from "jsr:@std/assert@0.217";
import { createJobStore } from "../llm-advisory/job-store.ts";
import { AdvisoryTriggerReason } from "../types/llm-advisory.ts";
import type {
  AdvisoryNote,
  LlmJob,
  LlmPromptAudit,
  LlmResponseAudit,
  LlmWorkerSession,
} from "../types/llm-advisory.ts";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

function baseJob(overrides: Partial<Omit<LlmJob, "id">> = {}): Omit<LlmJob, "id"> {
  return {
    symbol: "AAPL",
    triggerReason: AdvisoryTriggerReason.UI_REQUEST,
    status: "queued",
    contextHash: "ctx-" + crypto.randomUUID(),
    priority: 100,
    requestedBy: "u-1",
    createdAt: Date.now(),
    claimedAt: null,
    completedAt: null,
    workerSessionId: null,
    errorMessage: null,
    retryCount: 0,
    ...overrides,
  };
}

function baseSession(
  overrides: Partial<Omit<LlmWorkerSession, "id">> = {},
): Omit<LlmWorkerSession, "id"> {
  return {
    startedAt: Date.now(),
    endedAt: null,
    provider: "mock",
    modelId: "mock-v1",
    jobsProcessed: 0,
    jobsFailed: 0,
    pid: 12345,
    exitReason: null,
    ...overrides,
  };
}

function baseNote(
  jobId: string,
  overrides: Partial<Omit<AdvisoryNote, "id">> = {},
): Omit<AdvisoryNote, "id"> {
  return {
    jobId,
    symbol: "AAPL",
    content: "advisory body",
    provider: "mock",
    modelId: "mock-v1",
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 1234,
    signalSnapshot: JSON.stringify({ score: 0.5 }),
    recommendationSnapshot: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function basePromptAudit(jobId: string): Omit<LlmPromptAudit, "id"> {
  return {
    jobId,
    promptText: "what does AAPL look like today?",
    systemPromptHash: "abc1234",
    contextSizeChars: 1234,
    ts: Date.now(),
  };
}

function baseResponseAudit(jobId: string): Omit<LlmResponseAudit, "id"> {
  return {
    jobId,
    rawResponse: "raw model output",
    parsedSuccessfully: true,
    parseErrorMessage: null,
    ts: Date.now(),
  };
}

Deno.test({
  name: "[job-store] full lifecycle against a real Postgres instance",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const pg = await startEphemeralPostgres();
    try {
      await applyMigrations(pg.url);
      const pool = new Pool(pg.url, 2, false);
      try {
        const store = createJobStore(pool);

        await t.step("insertJob + getJob round-trips fields", async () => {
          const id = await store.insertJob(baseJob({ symbol: "MSFT", priority: 50 }));
          const fetched = await store.getJob(id);
          assert(fetched, "expected to find inserted job");
          assertEquals(fetched.symbol, "MSFT");
          assertEquals(fetched.priority, 50);
          assertEquals(fetched.status, "queued");
          assertEquals(fetched.retryCount, 0);
          assertEquals(fetched.requestedBy, "u-1");
        });

        await t.step("getJob returns null for unknown id", async () => {
          const fake = crypto.randomUUID();
          assertEquals(await store.getJob(fake), null);
        });

        await t.step(
          "claimNextJob picks highest priority then oldest createdAt and marks it running",
          async () => {
            // Fresh table state: cancel anything we left behind
            await store.cancelJobsForSymbol("MSFT");

            const now = Date.now();
            await store.insertJob(baseJob({ symbol: "X", priority: 10, createdAt: now - 100 }));
            const winner = await store.insertJob(
              baseJob({ symbol: "X", priority: 100, createdAt: now }),
            );
            await store.insertJob(baseJob({ symbol: "X", priority: 100, createdAt: now + 100 }));

            const claimed = await store.claimNextJob("worker-A");
            assert(claimed);
            assertEquals(claimed.id, winner);
            assertEquals(claimed.status, "running");
            assertEquals(claimed.workerSessionId, "worker-A");
            assertGreater(claimed.claimedAt ?? 0, 0);
          },
        );

        await t.step("claimNextJob returns null when no queued jobs remain", async () => {
          // Drain whatever is still queued from the previous step
          while ((await store.claimNextJob("drainer")) !== null) {
            // loop
          }
          assertEquals(await store.claimNextJob("worker-B"), null);
        });

        await t.step("updateJobStatus transitions status + retry/error fields", async () => {
          const id = await store.insertJob(baseJob({ symbol: "STAT" }));
          await store.updateJobStatus(id, "failed", {
            completedAt: Date.now(),
            errorMessage: "boom",
            retryCount: 2,
          });
          const after = await store.getJob(id);
          assert(after);
          assertEquals(after.status, "failed");
          assertEquals(after.errorMessage, "boom");
          assertEquals(after.retryCount, 2);
        });

        await t.step("getJobsBySymbol returns newest-first up to limit", async () => {
          const sym = "LIM-" + crypto.randomUUID().slice(0, 6);
          const now = Date.now();
          for (let i = 0; i < 3; i++) {
            await store.insertJob(baseJob({ symbol: sym, createdAt: now + i }));
          }
          const all = await store.getJobsBySymbol(sym);
          assertEquals(all.length, 3);
          assertGreater(all[0].createdAt, all[1].createdAt);

          const limited = await store.getJobsBySymbol(sym, 1);
          assertEquals(limited.length, 1);
        });

        await t.step("getPendingJobCount counts queued + running only", async () => {
          // Wipe via cancel + complete so the count is deterministic
          const sym = "CNT-" + crypto.randomUUID().slice(0, 6);
          const q = await store.insertJob(baseJob({ symbol: sym }));
          const r = await store.insertJob(baseJob({ symbol: sym }));
          const d = await store.insertJob(baseJob({ symbol: sym }));
          await store.updateJobStatus(r, "running");
          await store.updateJobStatus(d, "done", { completedAt: Date.now() });
          const count = await store.getPendingJobCount();
          assert(count >= 2, `expected >= 2 pending, got ${count}`);
          // Cleanup the queued so later sweeps don't trip
          await store.updateJobStatus(q, "cancelled");
          await store.updateJobStatus(r, "done", { completedAt: Date.now() });
        });

        await t.step("hasRecentJob respects the time window", async () => {
          const hash = "hh-" + crypto.randomUUID();
          await store.insertJob(baseJob({ contextHash: hash, createdAt: Date.now() }));
          assertEquals(await store.hasRecentJob(hash, 10_000), true);
          // Zero-width window: nothing is "more recent than now()"
          assertEquals(await store.hasRecentJob(hash, 0), false);
          assertEquals(await store.hasRecentJob("missing-hash", 10_000), false);
        });

        await t.step("cancelJobsForSymbol only cancels queued rows", async () => {
          const sym = "CAN-" + crypto.randomUUID().slice(0, 6);
          const q1 = await store.insertJob(baseJob({ symbol: sym }));
          const r1 = await store.insertJob(baseJob({ symbol: sym }));
          await store.updateJobStatus(r1, "running");
          const cancelled = await store.cancelJobsForSymbol(sym);
          assertEquals(cancelled, 1);
          const q1After = await store.getJob(q1);
          const r1After = await store.getJob(r1);
          assertEquals(q1After?.status, "cancelled");
          assertEquals(r1After?.status, "running");
          await store.updateJobStatus(r1, "done", { completedAt: Date.now() });
        });

        await t.step("worker session insert + update round-trips", async () => {
          const sessionId = await store.insertWorkerSession(
            baseSession({ jobsProcessed: 0, jobsFailed: 0 }),
          );
          assert(sessionId);
          await store.updateWorkerSession(sessionId, {
            jobsProcessed: 5,
            jobsFailed: 1,
            endedAt: Date.now(),
            exitReason: "idle-timeout",
          });
          // No getter, but we can confirm via direct query
          const client = await pool.connect();
          try {
            const { rows } = await client.queryArray<
              [number, number, string]
            >(
              `SELECT jobs_processed, jobs_failed, exit_reason
                 FROM llm_advisory.worker_sessions WHERE id = $1`,
              [sessionId],
            );
            assertEquals(rows.length, 1);
            assertEquals(Number(rows[0][0]), 5);
            assertEquals(Number(rows[0][1]), 1);
            assertEquals(rows[0][2], "idle-timeout");
          } finally {
            client.release();
          }
        });

        await t.step("note + audit insertion + getLatestNote works", async () => {
          const jobId = await store.insertJob(
            baseJob({ symbol: "NOTE-SYM", status: "done", completedAt: Date.now() }),
          );
          await store.insertPromptAudit(basePromptAudit(jobId));
          await store.insertResponseAudit(baseResponseAudit(jobId));
          await store.insertNote(baseNote(jobId, { symbol: "NOTE-SYM" }));
          await new Promise((r) => setTimeout(r, 5));
          await store.insertNote(
            baseNote(jobId, { symbol: "NOTE-SYM", content: "newer", createdAt: Date.now() + 1 }),
          );
          const latest = await store.getLatestNote("NOTE-SYM");
          assert(latest, "expected a latest note");
          assertEquals(latest.content, "newer");
        });

        await t.step("getLatestNote returns null when symbol has no notes", async () => {
          const v = await store.getLatestNote("DEF-NOT-PRESENT-" + crypto.randomUUID());
          assertEquals(v, null);
        });

        await t.step("sweepStuckJobs requeues old running jobs", async () => {
          const stuck = await store.insertJob(baseJob({ symbol: "STK" }));
          // Mark running with an old claimedAt by direct SQL
          const client = await pool.connect();
          try {
            await client.queryArray(
              `UPDATE llm_advisory.jobs SET status = 'running', claimed_at = $1, worker_session_id = 'gone' WHERE id = $2`,
              [Date.now() - 10 * 60 * 1000, stuck],
            );
          } finally {
            client.release();
          }
          const requeued = await store.sweepStuckJobs(5 * 60 * 1000);
          assert(requeued >= 1);
          const after = await store.getJob(stuck);
          assertEquals(after?.status, "queued");
          assertEquals(after?.claimedAt, null);
          assertEquals(after?.workerSessionId, null);
          await store.updateJobStatus(stuck, "cancelled");
        });

        await t.step("pruneOldData removes terminal jobs older than cutoff", async () => {
          const old = await store.insertJob(
            baseJob({ symbol: "OLD", status: "done", createdAt: 1, completedAt: 2 }),
          );
          const client = await pool.connect();
          try {
            await client.queryArray(
              `UPDATE llm_advisory.jobs SET created_at = 1 WHERE id = $1`,
              [old],
            );
          } finally {
            client.release();
          }
          await store.pruneOldData(60_000);
          assertEquals(await store.getJob(old), null);
        });
      } finally {
        await pool.end();
      }
    } finally {
      await pg.teardown();
    }
  },
});
