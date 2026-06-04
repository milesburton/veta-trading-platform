import { assert, assertEquals, assertGreater } from "jsr:@std/assert@0.217";
import type {
  AdvisoryNote,
  AdvisoryTriggerReason,
  LlmJob,
  LlmPromptAudit,
  LlmResponseAudit,
  LlmWorkerSession,
} from "@veta/types/llm-advisory";
import { createJobStore } from "../llm-advisory/job-store.ts";

type JobState = LlmJob;
type NoteState = AdvisoryNote;
type PromptAuditState = LlmPromptAudit;
type ResponseAuditState = LlmResponseAudit;
type WorkerSessionState = LlmWorkerSession;

interface FakeClient {
  queryArray<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

interface FakePool {
  connect(): Promise<FakeClient>;
  __state(): {
    jobs: JobState[];
    notes: NoteState[];
    promptAudits: PromptAuditState[];
    responseAudits: ResponseAuditState[];
    workerSessions: WorkerSessionState[];
  };
}

function makeJob(overrides: Partial<Omit<LlmJob, "id">> = {}): Omit<LlmJob, "id"> {
  return {
    symbol: "AAPL",
    triggerReason: "UI_REQUEST" as AdvisoryTriggerReason,
    status: "queued",
    contextHash: `ctx-${crypto.randomUUID()}`,
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

function makeNote(
  jobId: string,
  overrides: Partial<Omit<AdvisoryNote, "id">> = {}
): Omit<AdvisoryNote, "id"> {
  return {
    jobId,
    symbol: "AAPL",
    content: "note body",
    provider: "mock",
    modelId: "model",
    promptTokens: 12,
    completionTokens: 34,
    latencyMs: 56,
    signalSnapshot: "{}",
    recommendationSnapshot: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<Omit<LlmWorkerSession, "id">> = {}
): Omit<LlmWorkerSession, "id"> {
  return {
    startedAt: Date.now(),
    endedAt: null,
    provider: "mock",
    modelId: "model",
    jobsProcessed: 0,
    jobsFailed: 0,
    pid: 123,
    exitReason: null,
    ...overrides,
  };
}

function makeFakePool(): FakePool {
  const state = {
    jobs: [] as JobState[],
    notes: [] as NoteState[],
    promptAudits: [] as PromptAuditState[],
    responseAudits: [] as ResponseAuditState[],
    workerSessions: [] as WorkerSessionState[],
  };

  return {
    async connect(): Promise<FakeClient> {
      await Promise.resolve();
      return {
        async queryArray<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
          await Promise.resolve();
          const trimmed = sql.trim();
          if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
            return { rows: [] as T[] };
          }

          if (sql.includes("INSERT INTO llm_advisory.jobs")) {
            state.jobs.push({
              id: String(params[0]),
              symbol: String(params[1]),
              triggerReason: params[2] as AdvisoryTriggerReason,
              status: params[3] as LlmJob["status"],
              contextHash: String(params[4]),
              priority: Number(params[5]),
              requestedBy: (params[6] as string | null) ?? null,
              createdAt: Number(params[7]),
              claimedAt: params[8] === null ? null : Number(params[8]),
              completedAt: params[9] === null ? null : Number(params[9]),
              workerSessionId: (params[10] as string | null) ?? null,
              errorMessage: (params[11] as string | null) ?? null,
              retryCount: Number(params[12]),
            });
            return { rows: [] as T[] };
          }

          if (sql.includes("FROM llm_advisory.jobs WHERE id = $1")) {
            const found = state.jobs.find((job) => job.id === params[0]);
            if (!found) return { rows: [] as T[] };
            return {
              rows: [
                [
                  found.id,
                  found.symbol,
                  found.triggerReason,
                  found.status,
                  found.contextHash,
                  found.priority,
                  found.requestedBy,
                  found.createdAt,
                  found.claimedAt,
                  found.completedAt,
                  found.workerSessionId,
                  found.errorMessage,
                  found.retryCount,
                ],
              ] as unknown as T[],
            };
          }

          if (sql.includes("SET status = 'running', claimed_at = $1, worker_session_id = $2")) {
            const queued = state.jobs
              .filter((job) => job.status === "queued")
              .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0];
            if (!queued) return { rows: [] as T[] };
            queued.status = "running";
            queued.claimedAt = Number(params[0]);
            queued.workerSessionId = String(params[1]);
            return {
              rows: [
                [
                  queued.id,
                  queued.symbol,
                  queued.triggerReason,
                  queued.status,
                  queued.contextHash,
                  queued.priority,
                  queued.requestedBy,
                  queued.createdAt,
                  queued.claimedAt,
                  queued.completedAt,
                  queued.workerSessionId,
                  queued.errorMessage,
                  queued.retryCount,
                ],
              ] as unknown as T[],
            };
          }

          if (sql.includes("UPDATE llm_advisory.jobs") && sql.includes("WHERE id = $5")) {
            const found = state.jobs.find((job) => job.id === params[4]);
            if (found) {
              found.status = params[0] as LlmJob["status"];
              if (params[1] !== null) found.completedAt = Number(params[1]);
              if (params[2] !== null) found.errorMessage = String(params[2]);
              if (params[3] !== null) found.retryCount = Number(params[3]);
            }
            return { rows: [] as T[] };
          }

          if (
            sql.includes(
              "FROM llm_advisory.jobs WHERE symbol = $1 ORDER BY created_at DESC LIMIT $2"
            )
          ) {
            const rows = state.jobs
              .filter((job) => job.symbol === params[0])
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, Number(params[1]))
              .map((job) => [
                job.id,
                job.symbol,
                job.triggerReason,
                job.status,
                job.contextHash,
                job.priority,
                job.requestedBy,
                job.createdAt,
                job.claimedAt,
                job.completedAt,
                job.workerSessionId,
                job.errorMessage,
                job.retryCount,
              ]);
            return { rows: rows as unknown as T[] };
          }

          if (
            sql.includes(
              "SELECT COUNT(*) FROM llm_advisory.jobs WHERE status IN ('queued', 'running')"
            )
          ) {
            const count = state.jobs.filter(
              (job) => job.status === "queued" || job.status === "running"
            ).length;
            return { rows: [[count]] as unknown as T[] };
          }

          if (
            sql.includes("WHERE context_hash = $1 AND created_at > $2 AND status != 'cancelled'")
          ) {
            const count = state.jobs.filter(
              (job) =>
                job.contextHash === params[0] &&
                job.createdAt > Number(params[1]) &&
                job.status !== "cancelled"
            ).length;
            return { rows: [[count]] as unknown as T[] };
          }

          if (sql.includes("UPDATE llm_advisory.jobs SET status = 'cancelled'")) {
            let count = 0;
            for (const job of state.jobs) {
              if (job.symbol === params[0] && job.status === "queued") {
                job.status = "cancelled";
                count++;
              }
            }
            return { rows: [[count]] as unknown as T[] };
          }

          if (sql.includes("INSERT INTO llm_advisory.advisory_notes")) {
            state.notes.push({
              id: String(params[0]),
              jobId: String(params[1]),
              symbol: String(params[2]),
              content: String(params[3]),
              provider: String(params[4]),
              modelId: String(params[5]),
              promptTokens: Number(params[6]),
              completionTokens: Number(params[7]),
              latencyMs: Number(params[8]),
              signalSnapshot: String(params[9]),
              recommendationSnapshot: (params[10] as string | null) ?? null,
              createdAt: Number(params[11]),
            });
            return { rows: [] as T[] };
          }

          if (
            sql.includes(
              "FROM llm_advisory.advisory_notes WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1"
            )
          ) {
            const note = state.notes
              .filter((row) => row.symbol === params[0])
              .sort((a, b) => b.createdAt - a.createdAt)[0];
            if (!note) return { rows: [] as T[] };
            return {
              rows: [
                [
                  note.id,
                  note.jobId,
                  note.symbol,
                  note.content,
                  note.provider,
                  note.modelId,
                  note.promptTokens,
                  note.completionTokens,
                  note.latencyMs,
                  note.signalSnapshot,
                  note.recommendationSnapshot,
                  note.createdAt,
                ],
              ] as unknown as T[],
            };
          }

          if (sql.includes("INSERT INTO llm_advisory.prompt_audit")) {
            state.promptAudits.push({
              id: String(params[0]),
              jobId: String(params[1]),
              promptText: String(params[2]),
              systemPromptHash: String(params[3]),
              contextSizeChars: Number(params[4]),
              ts: Number(params[5]),
            });
            return { rows: [] as T[] };
          }

          if (sql.includes("INSERT INTO llm_advisory.response_audit")) {
            state.responseAudits.push({
              id: String(params[0]),
              jobId: String(params[1]),
              rawResponse: String(params[2]),
              parsedSuccessfully: Boolean(params[3]),
              parseErrorMessage: (params[4] as string | null) ?? null,
              ts: Number(params[5]),
            });
            return { rows: [] as T[] };
          }

          if (sql.includes("INSERT INTO llm_advisory.worker_sessions")) {
            state.workerSessions.push({
              id: String(params[0]),
              startedAt: Number(params[1]),
              endedAt: params[2] === null ? null : Number(params[2]),
              provider: String(params[3]),
              modelId: String(params[4]),
              jobsProcessed: Number(params[5]),
              jobsFailed: Number(params[6]),
              pid: Number(params[7]),
              exitReason: (params[8] as string | null) ?? null,
            });
            return { rows: [] as T[] };
          }

          if (sql.includes("UPDATE llm_advisory.worker_sessions")) {
            const found = state.workerSessions.find((row) => row.id === params[4]);
            if (found) {
              if (params[0] !== null) found.endedAt = Number(params[0]);
              if (params[1] !== null) found.jobsProcessed = Number(params[1]);
              if (params[2] !== null) found.jobsFailed = Number(params[2]);
              if (params[3] !== null) found.exitReason = String(params[3]);
            }
            return { rows: [] as T[] };
          }

          if (sql.includes("SET status = 'queued', claimed_at = NULL, worker_session_id = NULL")) {
            let count = 0;
            const cutoff = Number(params[0]);
            for (const job of state.jobs) {
              if (job.status === "running" && job.claimedAt !== null && job.claimedAt < cutoff) {
                job.status = "queued";
                job.claimedAt = null;
                job.workerSessionId = null;
                count++;
              }
            }
            return { rows: [[count]] as unknown as T[] };
          }

          if (
            sql.includes(
              "DELETE FROM llm_advisory.jobs WHERE status IN ('done', 'failed', 'cancelled')"
            )
          ) {
            const cutoff = Number(params[0]);
            state.jobs = state.jobs.filter(
              (job) =>
                !["done", "failed", "cancelled"].includes(job.status) || job.createdAt >= cutoff
            );
            return { rows: [] as T[] };
          }

          if (sql.includes("DELETE FROM llm_advisory.advisory_notes WHERE created_at < $1")) {
            const cutoff = Number(params[0]);
            state.notes = state.notes.filter((note) => note.createdAt >= cutoff);
            return { rows: [] as T[] };
          }

          if (sql.includes("DELETE FROM llm_advisory.prompt_audit WHERE ts < $1")) {
            const cutoff = Number(params[0]);
            state.promptAudits = state.promptAudits.filter((row) => row.ts >= cutoff);
            return { rows: [] as T[] };
          }

          if (sql.includes("DELETE FROM llm_advisory.response_audit WHERE ts < $1")) {
            const cutoff = Number(params[0]);
            state.responseAudits = state.responseAudits.filter((row) => row.ts >= cutoff);
            return { rows: [] as T[] };
          }

          throw new Error(`Unhandled SQL in fake job store pool: ${sql}`);
        },
        release() {},
      };
    },
    __state() {
      return state;
    },
  };
}

Deno.test("[job-store] CRUD helpers work against a fake pool", async () => {
  const pool = makeFakePool();
  const store = createJobStore(pool as unknown as Parameters<typeof createJobStore>[0]);

  const firstId = await store.insertJob(makeJob({ symbol: "MSFT", priority: 10 }));
  const secondId = await store.insertJob(makeJob({ symbol: "MSFT", priority: 50, createdAt: 900 }));
  const thirdId = await store.insertJob(makeJob({ symbol: "MSFT", priority: 50, createdAt: 1100 }));

  const fetched = await store.getJob(firstId);
  assert(fetched);
  assertEquals(fetched.symbol, "MSFT");

  const claimed = await store.claimNextJob("worker-1");
  assert(claimed);
  assertEquals(claimed.id, secondId);
  assertEquals(claimed.status, "running");
  assertEquals(claimed.workerSessionId, "worker-1");
  assertGreater(claimed.claimedAt ?? 0, 0);

  await store.updateJobStatus(firstId, "failed", {
    completedAt: 2000,
    errorMessage: "boom",
    retryCount: 2,
  });
  const afterStatus = await store.getJob(firstId);
  assertEquals(afterStatus?.status, "failed");
  assertEquals(afterStatus?.errorMessage, "boom");
  assertEquals(afterStatus?.retryCount, 2);

  const jobs = await store.getJobsBySymbol("MSFT", 2);
  assertEquals(jobs.length, 2);
  assertEquals(jobs[0].createdAt >= jobs[1].createdAt, true);

  assertEquals(await store.getPendingJobCount(), 2);
  assertEquals(await store.hasRecentJob(afterStatus?.contextHash, 10_000_000_000), true);
  assertEquals(await store.hasRecentJob("missing", 10_000), false);

  const cancelled = await store.cancelJobsForSymbol("MSFT");
  assertEquals(cancelled, 1);
  assertEquals((await store.getJob(thirdId))?.status, "cancelled");
});

Deno.test("[job-store] note, audit, worker session and pruning helpers work", async () => {
  const pool = makeFakePool();
  const store = createJobStore(pool as unknown as Parameters<typeof createJobStore>[0]);

  const jobId = await store.insertJob(
    makeJob({
      symbol: "AAPL",
      status: "done",
      createdAt: 1000,
      completedAt: 1100,
    })
  );
  await store.insertPromptAudit({
    jobId,
    promptText: "prompt",
    systemPromptHash: "hash",
    contextSizeChars: 123,
    ts: 1000,
  });
  await store.insertResponseAudit({
    jobId,
    rawResponse: "raw",
    parsedSuccessfully: true,
    parseErrorMessage: null,
    ts: 1000,
  });
  await store.insertNote(makeNote(jobId, { symbol: "AAPL", createdAt: 1000, content: "older" }));
  await store.insertNote(makeNote(jobId, { symbol: "AAPL", createdAt: 2000, content: "newer" }));

  const latest = await store.getLatestNote("AAPL");
  assertEquals(latest?.content, "newer");

  const sessionId = await store.insertWorkerSession(makeSession());
  await store.updateWorkerSession(sessionId, {
    jobsProcessed: 5,
    jobsFailed: 1,
    endedAt: 3000,
    exitReason: "idle-timeout",
  });
  const session = pool.__state().workerSessions.find((row) => row.id === sessionId);
  assertEquals(session?.jobsProcessed, 5);
  assertEquals(session?.jobsFailed, 1);
  assertEquals(session?.exitReason, "idle-timeout");

  const stuckId = await store.insertJob(
    makeJob({
      symbol: "STUCK",
      status: "running",
      claimedAt: 100,
      workerSessionId: "worker-2",
      createdAt: 50,
    })
  );
  const swept = await store.sweepStuckJobs(10_000_000_000);
  assertEquals(swept, 1);
  const sweptJob = await store.getJob(stuckId);
  assertEquals(sweptJob?.status, "queued");
  assertEquals(sweptJob?.claimedAt, null);

  await store.pruneOldData(500);
  assertEquals(
    pool.__state().jobs.some((row) => row.id === jobId),
    false
  );
  assertEquals(pool.__state().notes.length, 0);
  assertEquals(pool.__state().promptAudits.length, 0);
  assertEquals(pool.__state().responseAudits.length, 0);
});
