import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import type {
  AdvisoryNote,
  LlmJob,
  LlmJobStatus,
  LlmPromptAudit,
  LlmResponseAudit,
  LlmWorkerSession,
} from "../types/llm-advisory.ts";

export class JobStore {
  private db: DB;

  constructor(dbPath: string) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) Deno.mkdirSync(dir, { recursive: true });

    this.db = new DB(dbPath);

    this.db.query("PRAGMA journal_mode=WAL");
    this.db.query("PRAGMA synchronous=NORMAL");
    this.db.query("PRAGMA busy_timeout=3000");

    this.db.query(`
      CREATE TABLE IF NOT EXISTS llm_jobs (
        id TEXT PRIMARY KEY, symbol TEXT NOT NULL, trigger_reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', context_hash TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0, requested_by TEXT,
        created_at INTEGER NOT NULL, claimed_at INTEGER, completed_at INTEGER,
        worker_session_id TEXT, error_message TEXT, retry_count INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.db.query(
      "CREATE INDEX IF NOT EXISTS idx_llm_jobs_symbol_status ON llm_jobs(symbol, status)",
    );
    this.db.query(
      "CREATE INDEX IF NOT EXISTS idx_llm_jobs_status_priority ON llm_jobs(status, priority DESC, created_at ASC)",
    );
    this.db.query(
      "CREATE INDEX IF NOT EXISTS idx_llm_jobs_context_hash ON llm_jobs(context_hash, created_at DESC)",
    );

    this.db.query(`
      CREATE TABLE IF NOT EXISTS advisory_notes (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, symbol TEXT NOT NULL,
        content TEXT NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER NOT NULL DEFAULT 0, signal_snapshot TEXT NOT NULL,
        recommendation_snapshot TEXT, created_at INTEGER NOT NULL
      )
    `);
    this.db.query(
      "CREATE INDEX IF NOT EXISTS idx_advisory_notes_symbol_ts ON advisory_notes(symbol, created_at DESC)",
    );

    this.db.query(`
      CREATE TABLE IF NOT EXISTS llm_prompt_audit (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, prompt_text TEXT NOT NULL,
        system_prompt_hash TEXT NOT NULL, context_size_chars INTEGER NOT NULL, ts INTEGER NOT NULL
      )
    `);

    this.db.query(`
      CREATE TABLE IF NOT EXISTS llm_response_audit (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, raw_response TEXT NOT NULL,
        parsed_successfully INTEGER NOT NULL DEFAULT 1, parse_error_message TEXT, ts INTEGER NOT NULL
      )
    `);

    this.db.query(`
      CREATE TABLE IF NOT EXISTS llm_worker_sessions (
        id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER,
        provider TEXT NOT NULL, model_id TEXT NOT NULL,
        jobs_processed INTEGER NOT NULL DEFAULT 0, jobs_failed INTEGER NOT NULL DEFAULT 0,
        pid INTEGER NOT NULL
      )
    `);
  }

  insertJob(job: Omit<LlmJob, "id">): string {
    const id = crypto.randomUUID();
    this.db.query(
      `INSERT INTO llm_jobs
        (id, symbol, trigger_reason, status, context_hash, priority, requested_by,
         created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
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
      ],
    );
    return id;
  }

  claimNextJob(workerSessionId: string): LlmJob | null {
    let claimed: LlmJob | null = null;

    this.db.transaction(() => {
      const rows = [
        ...this.db.query<[string]>(
          `SELECT id FROM llm_jobs
           WHERE status = 'queued'
           ORDER BY priority DESC, created_at ASC
           LIMIT 1`,
        ),
      ];
      if (rows.length === 0) return;

      const [jobId] = rows[0];
      const now = Date.now();

      this.db.query(
        `UPDATE llm_jobs
         SET status = 'running', claimed_at = ?, worker_session_id = ?
         WHERE id = ? AND status = 'queued'`,
        [now, workerSessionId, jobId],
      );

      claimed = this.getJob(jobId);
    });

    return claimed;
  }

  updateJobStatus(
    jobId: string,
    status: LlmJobStatus,
    fields?: { completedAt?: number; errorMessage?: string; retryCount?: number },
  ): void {
    this.db.query(
      `UPDATE llm_jobs
       SET status = ?,
           completed_at = COALESCE(?, completed_at),
           error_message = COALESCE(?, error_message),
           retry_count = COALESCE(?, retry_count)
       WHERE id = ?`,
      [
        status,
        fields?.completedAt ?? null,
        fields?.errorMessage ?? null,
        fields?.retryCount ?? null,
        jobId,
      ],
    );
  }

  getJob(jobId: string): LlmJob | null {
    const rows = [
      ...this.db.query<[string, string, string, string, string, number, string | null, number, number | null, number | null, string | null, string | null, number]>(
        `SELECT id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count
         FROM llm_jobs WHERE id = ?`,
        [jobId],
      ),
    ];
    if (rows.length === 0) return null;
    return this.rowToJob(rows[0]);
  }

  getJobsBySymbol(symbol: string, limit = 20): LlmJob[] {
    const rows = [
      ...this.db.query<[string, string, string, string, string, number, string | null, number, number | null, number | null, string | null, string | null, number]>(
        `SELECT id, symbol, trigger_reason, status, context_hash, priority, requested_by,
                created_at, claimed_at, completed_at, worker_session_id, error_message, retry_count
         FROM llm_jobs WHERE symbol = ? ORDER BY created_at DESC LIMIT ?`,
        [symbol, limit],
      ),
    ];
    return rows.map((r) => this.rowToJob(r));
  }

  getPendingJobCount(): number {
    const rows = [
      ...this.db.query<[number]>(
        `SELECT COUNT(*) FROM llm_jobs WHERE status IN ('queued', 'running')`,
      ),
    ];
    return rows[0]?.[0] ?? 0;
  }

  hasRecentJob(contextHash: string, windowMs: number): boolean {
    const cutoff = Date.now() - windowMs;
    const rows = [
      ...this.db.query<[number]>(
        `SELECT COUNT(*) FROM llm_jobs
         WHERE context_hash = ? AND created_at > ? AND status != 'cancelled'`,
        [contextHash, cutoff],
      ),
    ];
    return (rows[0]?.[0] ?? 0) > 0;
  }

  cancelJobsForSymbol(symbol: string): number {
    this.db.query(
      `UPDATE llm_jobs SET status = 'cancelled' WHERE symbol = ? AND status = 'queued'`,
      [symbol],
    );
    return this.db.changes;
  }

  insertNote(note: Omit<AdvisoryNote, "id">): string {
    const id = crypto.randomUUID();
    this.db.query(
      `INSERT INTO advisory_notes
        (id, job_id, symbol, content, provider, model_id, prompt_tokens, completion_tokens,
         latency_ms, signal_snapshot, recommendation_snapshot, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        note.recommendationSnapshot,
        note.createdAt,
      ],
    );
    return id;
  }

  getLatestNote(symbol: string): AdvisoryNote | null {
    const rows = [
      ...this.db.query<[string, string, string, string, string, string, number, number, number, string, string | null, number]>(
        `SELECT id, job_id, symbol, content, provider, model_id, prompt_tokens,
                completion_tokens, latency_ms, signal_snapshot, recommendation_snapshot, created_at
         FROM advisory_notes WHERE symbol = ? ORDER BY created_at DESC LIMIT 1`,
        [symbol],
      ),
    ];
    if (rows.length === 0) return null;
    return this.rowToNote(rows[0]);
  }

  insertPromptAudit(audit: Omit<LlmPromptAudit, "id">): void {
    const id = crypto.randomUUID();
    this.db.query(
      `INSERT INTO llm_prompt_audit
        (id, job_id, prompt_text, system_prompt_hash, context_size_chars, ts)
       VALUES (?,?,?,?,?,?)`,
      [id, audit.jobId, audit.promptText, audit.systemPromptHash, audit.contextSizeChars, audit.ts],
    );
  }

  insertResponseAudit(audit: Omit<LlmResponseAudit, "id">): void {
    const id = crypto.randomUUID();
    this.db.query(
      `INSERT INTO llm_response_audit
        (id, job_id, raw_response, parsed_successfully, parse_error_message, ts)
       VALUES (?,?,?,?,?,?)`,
      [
        id,
        audit.jobId,
        audit.rawResponse,
        audit.parsedSuccessfully ? 1 : 0,
        audit.parseErrorMessage,
        audit.ts,
      ],
    );
  }

  insertWorkerSession(session: Omit<LlmWorkerSession, "id">): string {
    const id = crypto.randomUUID();
    this.db.query(
      `INSERT INTO llm_worker_sessions
        (id, started_at, ended_at, provider, model_id, jobs_processed, jobs_failed, pid)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        session.startedAt,
        session.endedAt,
        session.provider,
        session.modelId,
        session.jobsProcessed,
        session.jobsFailed,
        session.pid,
      ],
    );
    return id;
  }

  updateWorkerSession(
    sessionId: string,
    fields: { endedAt?: number; jobsProcessed?: number; jobsFailed?: number },
  ): void {
    this.db.query(
      `UPDATE llm_worker_sessions
       SET ended_at = COALESCE(?, ended_at),
           jobs_processed = COALESCE(?, jobs_processed),
           jobs_failed = COALESCE(?, jobs_failed)
       WHERE id = ?`,
      [
        fields.endedAt ?? null,
        fields.jobsProcessed ?? null,
        fields.jobsFailed ?? null,
        sessionId,
      ],
    );
  }

  sweepStuckJobs(maxRunningAgeMs: number): number {
    const cutoff = Date.now() - maxRunningAgeMs;
    this.db.query(
      `UPDATE llm_jobs SET status = 'queued', claimed_at = NULL, worker_session_id = NULL
       WHERE status = 'running' AND claimed_at < ?`,
      [cutoff],
    );
    return this.db.changes;
  }

  pruneOldData(retentionMs: number): void {
    const cutoff = Date.now() - retentionMs;
    this.db.query(
      `DELETE FROM llm_jobs
       WHERE status IN ('done', 'failed', 'cancelled') AND created_at < ?`,
      [cutoff],
    );
    this.db.query(
      `DELETE FROM advisory_notes WHERE created_at < ?`,
      [cutoff],
    );
  }

  close(): void {
    this.db.close();
  }

  private rowToJob(
    r: [string, string, string, string, string, number, string | null, number, number | null, number | null, string | null, string | null, number],
  ): LlmJob {
    const [
      id, symbol, triggerReason, status, contextHash, priority, requestedBy,
      createdAt, claimedAt, completedAt, workerSessionId, errorMessage, retryCount,
    ] = r;
    return {
      id,
      symbol,
      triggerReason: triggerReason as LlmJob["triggerReason"],
      status: status as LlmJobStatus,
      contextHash,
      priority,
      requestedBy,
      createdAt,
      claimedAt,
      completedAt,
      workerSessionId,
      errorMessage,
      retryCount,
    };
  }

  private rowToNote(
    r: [string, string, string, string, string, string, number, number, number, string, string | null, number],
  ): AdvisoryNote {
    const [
      id, jobId, symbol, content, provider, modelId,
      promptTokens, completionTokens, latencyMs,
      signalSnapshot, recommendationSnapshot, createdAt,
    ] = r;
    return {
      id, jobId, symbol, content, provider, modelId,
      promptTokens, completionTokens, latencyMs,
      signalSnapshot, recommendationSnapshot, createdAt,
    };
  }
}
