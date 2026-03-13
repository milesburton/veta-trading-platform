-- Migration 0003: Intelligence pipeline — feature_vectors, signal_weights, LLM advisory tables
-- Migrates from SQLite to shared Postgres instance
-- Idempotent: all CREATE statements use IF NOT EXISTS

BEGIN;

-- ── Schemas ───────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS intelligence;
CREATE SCHEMA IF NOT EXISTS llm_advisory;

-- ── intelligence.feature_vectors ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intelligence.feature_vectors (
  id              BIGSERIAL        PRIMARY KEY,
  symbol          TEXT             NOT NULL,
  ts              BIGINT           NOT NULL,
  momentum        DOUBLE PRECISION NOT NULL DEFAULT 0,
  relative_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  realised_vol    DOUBLE PRECISION NOT NULL DEFAULT 0,
  sector_rs       DOUBLE PRECISION NOT NULL DEFAULT 0,
  event_score     DOUBLE PRECISION NOT NULL DEFAULT 0,
  news_velocity   DOUBLE PRECISION NOT NULL DEFAULT 0,
  sentiment_delta DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fv_symbol_ts
  ON intelligence.feature_vectors (symbol, ts DESC);

-- ── intelligence.signal_weights ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intelligence.signal_weights (
  id              INTEGER          PRIMARY KEY CHECK (id = 1),
  momentum        DOUBLE PRECISION NOT NULL,
  relative_volume DOUBLE PRECISION NOT NULL,
  realised_vol    DOUBLE PRECISION NOT NULL,
  sector_rs       DOUBLE PRECISION NOT NULL,
  event_score     DOUBLE PRECISION NOT NULL,
  news_velocity   DOUBLE PRECISION NOT NULL,
  sentiment_delta DOUBLE PRECISION NOT NULL,
  updated_at      BIGINT           NOT NULL
);

-- ── llm_advisory.jobs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_advisory.jobs (
  id                TEXT    PRIMARY KEY,
  symbol            TEXT    NOT NULL,
  trigger_reason    TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'queued',
  context_hash      TEXT    NOT NULL,
  priority          INTEGER NOT NULL DEFAULT 0,
  requested_by      TEXT,
  created_at        BIGINT  NOT NULL,
  claimed_at        BIGINT,
  completed_at      BIGINT,
  worker_session_id TEXT,
  error_message     TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_symbol_status
  ON llm_advisory.jobs (symbol, status);

CREATE INDEX IF NOT EXISTS idx_jobs_status_priority
  ON llm_advisory.jobs (status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_jobs_context_hash
  ON llm_advisory.jobs (context_hash, created_at DESC);

-- ── llm_advisory.advisory_notes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_advisory.advisory_notes (
  id                        TEXT    PRIMARY KEY,
  job_id                    TEXT    NOT NULL,
  symbol                    TEXT    NOT NULL,
  content                   TEXT    NOT NULL,
  provider                  TEXT    NOT NULL,
  model_id                  TEXT    NOT NULL,
  prompt_tokens             INTEGER NOT NULL DEFAULT 0,
  completion_tokens         INTEGER NOT NULL DEFAULT 0,
  latency_ms                INTEGER NOT NULL DEFAULT 0,
  signal_snapshot           TEXT    NOT NULL,
  recommendation_snapshot   TEXT,
  created_at                BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advisory_notes_symbol_ts
  ON llm_advisory.advisory_notes (symbol, created_at DESC);

-- ── llm_advisory.prompt_audit ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_advisory.prompt_audit (
  id                   TEXT    PRIMARY KEY,
  job_id               TEXT    NOT NULL,
  prompt_text          TEXT    NOT NULL,
  system_prompt_hash   TEXT    NOT NULL,
  context_size_chars   INTEGER NOT NULL,
  ts                   BIGINT  NOT NULL
);

-- ── llm_advisory.response_audit ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_advisory.response_audit (
  id                   TEXT    PRIMARY KEY,
  job_id               TEXT    NOT NULL,
  raw_response         TEXT    NOT NULL,
  parsed_successfully  BOOLEAN NOT NULL DEFAULT TRUE,
  parse_error_message  TEXT,
  ts                   BIGINT  NOT NULL
);

-- ── llm_advisory.worker_sessions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_advisory.worker_sessions (
  id              TEXT    PRIMARY KEY,
  started_at      BIGINT  NOT NULL,
  ended_at        BIGINT,
  provider        TEXT    NOT NULL,
  model_id        TEXT    NOT NULL,
  jobs_processed  INTEGER NOT NULL DEFAULT 0,
  jobs_failed     INTEGER NOT NULL DEFAULT 0,
  pid             INTEGER NOT NULL,
  exit_reason     TEXT
);

-- ── llm_advisory.runtime_config ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_advisory.runtime_config (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  worker_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_mode    TEXT    NOT NULL DEFAULT 'manual',
  updated_at      BIGINT  NOT NULL,
  updated_by      TEXT    NOT NULL DEFAULT 'system'
);

INSERT INTO public.schema_migrations (version) VALUES ('0003_intelligence')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
