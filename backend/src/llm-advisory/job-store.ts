import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import type {
  AdvisoryNote,
  LlmJob,
  LlmJobStatus,
  LlmPromptAudit,
  LlmResponseAudit,
  LlmWorkerSession,
} from "../types/llm-advisory.ts";

export interface JobStore {
  insertJob(job: Omit<LlmJob, "id">): string;
  claimNextJob(workerSessionId: string): LlmJob | null;
  updateJobStatus(jobId: string, status: LlmJobStatus, fields?: { completedAt?: number; errorMessage?: string; retryCount?: number }): void;
  getJob(jobId: string): LlmJob | null;
  getJobsBySymbol(symbol: string, limit?: number): LlmJob[];
  getPendingJobCount(): number;
  hasRecentJob(contextHash: string, windowMs: number): boolean;
  cancelJobsForSymbol(symbol: string): number;
  insertNote(note: Omit<AdvisoryNote, "id">): string;
  getLatestNote(symbol: string): AdvisoryNote | null;
  insertPromptAudit(audit: Omit<LlmPromptAudit, "id">): void;
  insertResponseAudit(audit: Omit<LlmResponseAudit, "id">): void;
  insertWorkerSession(session: Omit<LlmWorkerSession, "id">): string;
  updateWorkerSession(sessionId: string, fields: { endedAt?: number; jobsProcessed?: number; jobsFailed?: number; exitReason?: string }): void;
  sweepStuckJobs(maxRunningAgeMs: number): number;
  pruneOldData(retentionMs: number): void;
  close(): void;
}

type JobRow = [string, string, string, string, string, number, string | null, number, number | null, number | null, string | null, string | null, number];
type NoteRow = [string, string, string, string, string, string, number, number, number, string, string | null, number];

function rowToJob(r: JobRow): LlmJob {
  const [id, symbol, triggerReason, status, contextHash, priority, requestedBy,
    createdAt, claimedAt, completedAt, workerSessionId, errorMessage, retryCount] = r;
  return {
    id, symbol,
    triggerReason: triggerReason as LlmJob["triggerReason"],
    status: status as LlmJobStatus,
    contextHash, priority, requestedBy,
    createdAt, claimedAt, completedAt, workerSessionId, errorMessage, retryCount,
  };
}

function rowToNote(r: NoteRow): AdvisoryNote {
  const [id, jobId, symbol, content, provider, modelId,
    promptTokens, completionTokens, latencyMs,
    signalSnapshot, recommendationSnapshot, createdAt] = r;
  return { id, jobId, symbol, content, provider, modelId,
    promptTokens, completionTokens, latencyMs,
    signalSnapshot, recommendationSnapshot, createdAt };
}

export function createJobStore(dbPath: string): JobStore {
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) Deno.mkdirSync(dir, { recursive: true });

  const db = new DB(dbPath);
  db.query("PRAGMA journal_mode=WAL");
  db.query("PRAGMA synchronous=NORMAL");
  db.query("PRAGMA busy_timeout=3000");

  db.query(`
    CREATE TABLE IF NOT EXISTS llm_jobs (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL, trigger_reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', context_hash TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0, requested_by TEXT,
      created_at INTEGER NOT NULL, claimed_at INTEGER, completed_at INTEGER,
      worker_session_id TEXT, error_message TEXT, retry_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.query("CREATE INDEX IF NOT EXISTS idx_llm_jobs_symbol_status ON llm_jobs(symbol, status)");
  db.query("CREATE INDEX IF NOT EXISTS idx_llm_jobs_status_priority ON llm_jobs(status, priority DESC, created_at ASC)");
  db.query("CREATE INDEX IF NOT EXISTS idx_llm_jobs_context_hash ON llm_jobs(context_hash, created_at DESC)");

  db.query(`
    CREATE TABLE IF NOT EXISTS advisory_notes (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, symbol TEXT NOT NULL,
      content TEXT NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0, signal_snapshot TEXT NOT NULL,
      recommendation_snapshot TEXT, created_at INTEGER NOT NULL
    )
  `);
  db.query("CREATE INDEX IF NOT EXISTS idx_advisory_notes_symbol_ts ON advisory_notes(symbol, created_at DESC)");

  db.query(`
    CREATE TABLE IF NOT EXISTS llm_prompt_audit (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, prompt_text TEXT NOT NULL,
      system_prompt_hash TEXT NOT NULL, context_size_chars INTEGER NOT NULL, ts INTEGER NOT NULL
    )
  `);

  db.query(`
    CREATE TABLE IF NOT EXISTS llm_response_audit (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL, raw_response TEXT NOT NULL,
      parsed_successfully INTEGER NOT NULL DEFAULT 1, parse_error_message TEXT, ts INTEGER NOT NULL
    )
  `);

  db.query(`
    CREATE TABLE IF NOT EXISTS llm_worker_sessions (
      id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER,
      provider TEXT NOT NULL, model_id TEXT NOT NULL,
      jobs_processed INTEGER NOT NULL DEFAULT 0, jobs_failed INTEGER NOT NULL DEFAULT 0,
      pid INTEGER NOT NULL, exit_reason TEXT
    )
  `);

  function getJob(jobId: string): LlmJob | null {
    const rows = [
      ...db.query<JobRow>(
        `SELECT id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count
         FROM llm_jobs WHERE id = ?`,
        [jobId],
      ),
    ];
    return rows.length === 0 ? null : rowToJob(rows[0]);
  }

  return {
    insertJob(job: Omit<LlmJob, "id">): string {
      const id = crypto.randomUUID();
      db.query(
        `INSERT INTO llm_jobs
          (id, symbol, trigger_reason, status, context_hash, priority, requested_by,
           created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, job.symbol, job.triggerReason, job.status, job.contextHash, job.priority,
          job.requestedBy, job.createdAt, job.claimedAt, job.completedAt,
          job.workerSessionId, job.errorMessage, job.retryCount],
      );
      return id;
    },

    claimNextJob(workerSessionId: string): LlmJob | null {
      let claimed: LlmJob | null = null;
      db.transaction(() => {
        const rows = [...db.query<[string]>(
          `SELECT id FROM llm_jobs WHERE status = 'queued' ORDER BY priority DESC, created_at ASC LIMIT 1`,
        )];
        if (rows.length === 0) return;
        const [jobId] = rows[0];
        db.query(
          `UPDATE llm_jobs SET status = 'running', claimed_at = ?, worker_session_id = ? WHERE id = ? AND status = 'queued'`,
          [Date.now(), workerSessionId, jobId],
        );
        claimed = getJob(jobId);
      });
      return claimed;
    },

    updateJobStatus(jobId: string, status: LlmJobStatus, fields?: { completedAt?: number; errorMessage?: string; retryCount?: number }): void {
      db.query(
        `UPDATE llm_jobs
         SET status = ?,
             completed_at = COALESCE(?, completed_at),
             error_message = COALESCE(?, error_message),
             retry_count = COALESCE(?, retry_count)
         WHERE id = ?`,
        [status, fields?.completedAt ?? null, fields?.errorMessage ?? null, fields?.retryCount ?? null, jobId],
      );
    },

    getJob,

    getJobsBySymbol(symbol: string, limit = 20): LlmJob[] {
      const rows = [...db.query<JobRow>(
        `SELECT id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count
         FROM llm_jobs WHERE symbol = ? ORDER BY created_at DESC LIMIT ?`,
        [symbol, limit],
      )];
      return rows.map(rowToJob);
    },

    getPendingJobCount(): number {
      const rows = [...db.query<[number]>(`SELECT COUNT(*) FROM llm_jobs WHERE status IN ('queued', 'running')`)];
      return rows[0]?.[0] ?? 0;
    },

    hasRecentJob(contextHash: string, windowMs: number): boolean {
      const rows = [...db.query<[number]>(
        `SELECT COUNT(*) FROM llm_jobs WHERE context_hash = ? AND created_at > ? AND status != 'cancelled'`,
        [contextHash, Date.now() - windowMs],
      )];
      return (rows[0]?.[0] ?? 0) > 0;
    },

    cancelJobsForSymbol(symbol: string): number {
      db.query(`UPDATE llm_jobs SET status = 'cancelled' WHERE symbol = ? AND status = 'queued'`, [symbol]);
      return db.changes;
    },

    insertNote(note: Omit<AdvisoryNote, "id">): string {
      const id = crypto.randomUUID();
      db.query(
        `INSERT INTO advisory_notes
          (id, job_id, symbol, content, provider, model_id, prompt_tokens, completion_tokens,
           latency_ms, signal_snapshot, recommendation_snapshot, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, note.jobId, note.symbol, note.content, note.provider, note.modelId,
          note.promptTokens, note.completionTokens, note.latencyMs,
          note.signalSnapshot, note.recommendationSnapshot, note.createdAt],
      );
      return id;
    },

    getLatestNote(symbol: string): AdvisoryNote | null {
      const rows = [...db.query<NoteRow>(
        `SELECT id, job_id, symbol, content, provider, model_id, prompt_tokens,
                completion_tokens, latency_ms, signal_snapshot, recommendation_snapshot, created_at
         FROM advisory_notes WHERE symbol = ? ORDER BY created_at DESC LIMIT 1`,
        [symbol],
      )];
      return rows.length === 0 ? null : rowToNote(rows[0]);
    },

    insertPromptAudit(audit: Omit<LlmPromptAudit, "id">): void {
      db.query(
        `INSERT INTO llm_prompt_audit (id, job_id, prompt_text, system_prompt_hash, context_size_chars, ts) VALUES (?,?,?,?,?,?)`,
        [crypto.randomUUID(), audit.jobId, audit.promptText, audit.systemPromptHash, audit.contextSizeChars, audit.ts],
      );
    },

    insertResponseAudit(audit: Omit<LlmResponseAudit, "id">): void {
      db.query(
        `INSERT INTO llm_response_audit (id, job_id, raw_response, parsed_successfully, parse_error_message, ts) VALUES (?,?,?,?,?,?)`,
        [crypto.randomUUID(), audit.jobId, audit.rawResponse, audit.parsedSuccessfully ? 1 : 0, audit.parseErrorMessage, audit.ts],
      );
    },

    insertWorkerSession(session: Omit<LlmWorkerSession, "id">): string {
      const id = crypto.randomUUID();
      db.query(
        `INSERT INTO llm_worker_sessions
          (id, started_at, ended_at, provider, model_id, jobs_processed, jobs_failed, pid, exit_reason)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, session.startedAt, session.endedAt, session.provider, session.modelId,
          session.jobsProcessed, session.jobsFailed, session.pid, session.exitReason ?? null],
      );
      return id;
    },

    updateWorkerSession(sessionId: string, fields: { endedAt?: number; jobsProcessed?: number; jobsFailed?: number; exitReason?: string }): void {
      db.query(
        `UPDATE llm_worker_sessions
         SET ended_at = COALESCE(?, ended_at),
             jobs_processed = COALESCE(?, jobs_processed),
             jobs_failed = COALESCE(?, jobs_failed),
             exit_reason = COALESCE(?, exit_reason)
         WHERE id = ?`,
        [fields.endedAt ?? null, fields.jobsProcessed ?? null, fields.jobsFailed ?? null, fields.exitReason ?? null, sessionId],
      );
    },

    sweepStuckJobs(maxRunningAgeMs: number): number {
      db.query(
        `UPDATE llm_jobs SET status = 'queued', claimed_at = NULL, worker_session_id = NULL WHERE status = 'running' AND claimed_at < ?`,
        [Date.now() - maxRunningAgeMs],
      );
      return db.changes;
    },

    pruneOldData(retentionMs: number): void {
      const cutoff = Date.now() - retentionMs;
      db.query(`DELETE FROM llm_jobs WHERE status IN ('done', 'failed', 'cancelled') AND created_at < ?`, [cutoff]);
      db.query(`DELETE FROM advisory_notes WHERE created_at < ?`, [cutoff]);
    },

    close(): void {
      db.close();
    },
  };
}
