import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type {
  AdvisoryNote,
  LlmJob,
  LlmJobStatus,
  LlmPromptAudit,
  LlmResponseAudit,
  LlmWorkerSession,
} from "@veta/types/llm-advisory";

export interface JobStore {
  insertJob(job: Omit<LlmJob, "id">): Promise<string>;
  claimNextJob(workerSessionId: string): Promise<LlmJob | null>;
  updateJobStatus(
    jobId: string,
    status: LlmJobStatus,
    fields?: {
      completedAt?: number;
      errorMessage?: string;
      retryCount?: number;
    },
  ): Promise<void>;
  getJob(jobId: string): Promise<LlmJob | null>;
  getJobsBySymbol(symbol: string, limit?: number): Promise<LlmJob[]>;
  getPendingJobCount(): Promise<number>;
  hasRecentJob(contextHash: string, windowMs: number): Promise<boolean>;
  cancelJobsForSymbol(symbol: string): Promise<number>;
  insertNote(note: Omit<AdvisoryNote, "id">): Promise<string>;
  getLatestNote(symbol: string): Promise<AdvisoryNote | null>;
  insertPromptAudit(audit: Omit<LlmPromptAudit, "id">): Promise<void>;
  insertResponseAudit(audit: Omit<LlmResponseAudit, "id">): Promise<void>;
  insertWorkerSession(session: Omit<LlmWorkerSession, "id">): Promise<string>;
  updateWorkerSession(
    sessionId: string,
    fields: {
      endedAt?: number;
      jobsProcessed?: number;
      jobsFailed?: number;
      exitReason?: string;
    },
  ): Promise<void>;
  sweepStuckJobs(maxRunningAgeMs: number): Promise<number>;
  pruneOldData(retentionMs: number): Promise<void>;
}

function rowToJob(row: unknown[]): LlmJob {
  const [
    id,
    symbol,
    triggerReason,
    status,
    contextHash,
    priority,
    requestedBy,
    createdAt,
    claimedAt,
    completedAt,
    workerSessionId,
    errorMessage,
    retryCount,
  ] = row as [
    string,
    string,
    string,
    string,
    string,
    number,
    string | null,
    bigint | number,
    bigint | number | null,
    bigint | number | null,
    string | null,
    string | null,
    number,
  ];
  return {
    id,
    symbol,
    triggerReason: triggerReason as LlmJob["triggerReason"],
    status: status as LlmJobStatus,
    contextHash,
    priority,
    requestedBy,
    createdAt: Number(createdAt),
    claimedAt: claimedAt !== null ? Number(claimedAt) : null,
    completedAt: completedAt !== null ? Number(completedAt) : null,
    workerSessionId,
    errorMessage,
    retryCount: Number(retryCount),
  };
}

function rowToNote(row: unknown[]): AdvisoryNote {
  const [
    id,
    jobId,
    symbol,
    content,
    provider,
    modelId,
    promptTokens,
    completionTokens,
    latencyMs,
    signalSnapshot,
    recommendationSnapshot,
    createdAt,
  ] = row as [
    string,
    string,
    string,
    string,
    string,
    string,
    number,
    number,
    number,
    string,
    string | null,
    bigint | number,
  ];
  return {
    id,
    jobId,
    symbol,
    content,
    provider,
    modelId,
    promptTokens: Number(promptTokens),
    completionTokens: Number(completionTokens),
    latencyMs: Number(latencyMs),
    signalSnapshot,
    recommendationSnapshot,
    createdAt: Number(createdAt),
  };
}

export function createJobStore(pool: Pool): JobStore {
  async function getJob(jobId: string): Promise<LlmJob | null> {
    const client = await pool.connect();
    try {
      const { rows } = await client.queryArray(
        `SELECT id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count
         FROM llm_advisory.jobs WHERE id = $1`,
        [jobId],
      );
      return rows.length === 0 ? null : rowToJob(rows[0]);
    } finally {
      client.release();
    }
  }

  return {
    async insertJob(job: Omit<LlmJob, "id">): Promise<string> {
      const id = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO llm_advisory.jobs
            (id, symbol, trigger_reason, status, context_hash, priority, requested_by,
             created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            id,
            job.symbol,
            job.triggerReason,
            job.status,
            job.contextHash,
            job.priority,
            job.requestedBy ?? null,
            job.createdAt,
            job.claimedAt ?? null,
            job.completedAt ?? null,
            job.workerSessionId ?? null,
            job.errorMessage ?? null,
            job.retryCount,
          ],
        );
      } finally {
        client.release();
      }
      return id;
    },

    async claimNextJob(workerSessionId: string): Promise<LlmJob | null> {
      const client = await pool.connect();
      try {
        await client.queryArray("BEGIN");
        const { rows } = await client.queryArray(
          `UPDATE llm_advisory.jobs
           SET status = 'running', claimed_at = $1, worker_session_id = $2
           WHERE id = (
             SELECT id FROM llm_advisory.jobs
             WHERE status = 'queued'
             ORDER BY priority DESC, created_at ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
           )
           RETURNING id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                     created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count`,
          [Date.now(), workerSessionId],
        );
        if (rows.length === 0) {
          await client.queryArray("ROLLBACK");
          return null;
        }
        await client.queryArray("COMMIT");
        return rowToJob(rows[0]);
      } catch (err) {
        await client.queryArray("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async updateJobStatus(
      jobId: string,
      status: LlmJobStatus,
      fields?: {
        completedAt?: number;
        errorMessage?: string;
        retryCount?: number;
      },
    ): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray(
          `UPDATE llm_advisory.jobs
           SET status = $1,
               completed_at = COALESCE($2, completed_at),
               error_message = COALESCE($3, error_message),
               retry_count = COALESCE($4, retry_count)
           WHERE id = $5`,
          [
            status,
            fields?.completedAt ?? null,
            fields?.errorMessage ?? null,
            fields?.retryCount ?? null,
            jobId,
          ],
        );
      } finally {
        client.release();
      }
    },

    getJob,

    async getJobsBySymbol(symbol: string, limit = 20): Promise<LlmJob[]> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray(
          `SELECT id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                  created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count
           FROM llm_advisory.jobs WHERE symbol = $1 ORDER BY created_at DESC LIMIT $2`,
          [symbol, limit],
        );
        return rows.map(rowToJob);
      } finally {
        client.release();
      }
    },

    async getPendingJobCount(): Promise<number> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray<[bigint | number]>(
          `SELECT COUNT(*) FROM llm_advisory.jobs WHERE status IN ('queued', 'running')`,
        );
        return Number(rows[0]?.[0] ?? 0);
      } finally {
        client.release();
      }
    },

    async hasRecentJob(
      contextHash: string,
      windowMs: number,
    ): Promise<boolean> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray<[bigint | number]>(
          `SELECT COUNT(*) FROM llm_advisory.jobs
           WHERE context_hash = $1 AND created_at > $2 AND status != 'cancelled'`,
          [contextHash, Date.now() - windowMs],
        );
        return Number(rows[0]?.[0] ?? 0) > 0;
      } finally {
        client.release();
      }
    },

    async cancelJobsForSymbol(symbol: string): Promise<number> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray<[bigint | number]>(
          `WITH updated AS (
             UPDATE llm_advisory.jobs SET status = 'cancelled'
             WHERE symbol = $1 AND status = 'queued'
             RETURNING id
           ) SELECT COUNT(*) FROM updated`,
          [symbol],
        );
        return Number(rows[0]?.[0] ?? 0);
      } finally {
        client.release();
      }
    },

    async insertNote(note: Omit<AdvisoryNote, "id">): Promise<string> {
      const id = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO llm_advisory.advisory_notes
            (id, job_id, symbol, content, provider, model_id, prompt_tokens, completion_tokens,
             latency_ms, signal_snapshot, recommendation_snapshot, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            note.jobId,
            note.symbol,
            note.content,
            note.provider,
            note.modelId,
            note.promptTokens,
            note.completionTokens,
            note.latencyMs,
            note.signalSnapshot,
            note.recommendationSnapshot ?? null,
            note.createdAt,
          ],
        );
      } finally {
        client.release();
      }
      return id;
    },

    async getLatestNote(symbol: string): Promise<AdvisoryNote | null> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray(
          `SELECT id, job_id, symbol, content, provider, model_id, prompt_tokens,
                  completion_tokens, latency_ms, signal_snapshot, recommendation_snapshot, created_at
           FROM llm_advisory.advisory_notes WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1`,
          [symbol],
        );
        return rows.length === 0 ? null : rowToNote(rows[0]);
      } finally {
        client.release();
      }
    },

    async insertPromptAudit(audit: Omit<LlmPromptAudit, "id">): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO llm_advisory.prompt_audit
            (id, job_id, prompt_text, system_prompt_hash, context_size_chars, ts)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            crypto.randomUUID(),
            audit.jobId,
            audit.promptText,
            audit.systemPromptHash,
            audit.contextSizeChars,
            audit.ts,
          ],
        );
      } finally {
        client.release();
      }
    },

    async insertResponseAudit(
      audit: Omit<LlmResponseAudit, "id">,
    ): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO llm_advisory.response_audit
            (id, job_id, raw_response, parsed_successfully, parse_error_message, ts)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            crypto.randomUUID(),
            audit.jobId,
            audit.rawResponse,
            audit.parsedSuccessfully,
            audit.parseErrorMessage ?? null,
            audit.ts,
          ],
        );
      } finally {
        client.release();
      }
    },

    async insertWorkerSession(
      session: Omit<LlmWorkerSession, "id">,
    ): Promise<string> {
      const id = crypto.randomUUID();
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO llm_advisory.worker_sessions
            (id, started_at, ended_at, provider, model_id, jobs_processed, jobs_failed, pid, exit_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            session.startedAt,
            session.endedAt ?? null,
            session.provider,
            session.modelId,
            session.jobsProcessed,
            session.jobsFailed,
            session.pid,
            session.exitReason ?? null,
          ],
        );
      } finally {
        client.release();
      }
      return id;
    },

    async updateWorkerSession(
      sessionId: string,
      fields: {
        endedAt?: number;
        jobsProcessed?: number;
        jobsFailed?: number;
        exitReason?: string;
      },
    ): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray(
          `UPDATE llm_advisory.worker_sessions
           SET ended_at = COALESCE($1, ended_at),
               jobs_processed = COALESCE($2, jobs_processed),
               jobs_failed = COALESCE($3, jobs_failed),
               exit_reason = COALESCE($4, exit_reason)
           WHERE id = $5`,
          [
            fields.endedAt ?? null,
            fields.jobsProcessed ?? null,
            fields.jobsFailed ?? null,
            fields.exitReason ?? null,
            sessionId,
          ],
        );
      } finally {
        client.release();
      }
    },

    async sweepStuckJobs(maxRunningAgeMs: number): Promise<number> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray<[bigint | number]>(
          `WITH updated AS (
             UPDATE llm_advisory.jobs
             SET status = 'queued', claimed_at = NULL, worker_session_id = NULL
             WHERE status = 'running' AND claimed_at < $1
             RETURNING id
           ) SELECT COUNT(*) FROM updated`,
          [Date.now() - maxRunningAgeMs],
        );
        return Number(rows[0]?.[0] ?? 0);
      } finally {
        client.release();
      }
    },

    async pruneOldData(retentionMs: number): Promise<void> {
      const cutoff = Date.now() - retentionMs;
      const client = await pool.connect();
      try {
        await client.queryArray(
          `DELETE FROM llm_advisory.jobs WHERE status IN ('done', 'failed', 'cancelled') AND created_at < $1`,
          [cutoff],
        );
        await client.queryArray(
          `DELETE FROM llm_advisory.advisory_notes WHERE created_at < $1`,
          [cutoff],
        );
        await client.queryArray(
          `DELETE FROM llm_advisory.prompt_audit WHERE ts < $1`,
          [cutoff],
        );
        await client.queryArray(
          `DELETE FROM llm_advisory.response_audit WHERE ts < $1`,
          [cutoff],
        );
      } finally {
        client.release();
      }
    },
  };
}
