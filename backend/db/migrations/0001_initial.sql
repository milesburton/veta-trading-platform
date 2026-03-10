-- Migration 0001: Initial schema — journal, fix_archive, users
-- Idempotent: all CREATE statements use IF NOT EXISTS
-- Run via: deno run --allow-all backend/db/migrate.ts

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Schemas ───────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS journal;
CREATE SCHEMA IF NOT EXISTS fix_archive;
CREATE SCHEMA IF NOT EXISTS users;

-- ── journal.events ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal.events (
  id                BIGSERIAL        PRIMARY KEY,
  event_id          TEXT             UNIQUE,
  event_type        TEXT             NOT NULL,
  ts                TIMESTAMPTZ      NOT NULL,
  user_id           TEXT,
  algo              TEXT,
  instrument        TEXT,
  side              TEXT,
  order_id          TEXT,
  child_id          TEXT,
  quantity          DOUBLE PRECISION,
  limit_price       DOUBLE PRECISION,
  fill_price        DOUBLE PRECISION,
  filled_qty        DOUBLE PRECISION,
  market_price      DOUBLE PRECISION,
  market_impact_bps DOUBLE PRECISION,
  algo_params       JSONB,
  raw               JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_ts
  ON journal.events (ts DESC);

CREATE INDEX IF NOT EXISTS idx_events_order_id
  ON journal.events (order_id) WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_instrument
  ON journal.events (instrument) WHERE instrument IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_reconstruct_pass1
  ON journal.events (ts, order_id)
  WHERE order_id IS NOT NULL
    AND event_type IN ('orders.submitted','orders.routed','orders.expired','orders.rejected');

CREATE INDEX IF NOT EXISTS idx_events_reconstruct_pass2
  ON journal.events (ts, order_id)
  WHERE order_id IS NOT NULL
    AND event_type IN ('orders.child','orders.filled');

-- ── journal.candles ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal.candles (
  instrument TEXT             NOT NULL,
  interval   TEXT             NOT NULL,
  time       TIMESTAMPTZ      NOT NULL,
  open       DOUBLE PRECISION NOT NULL,
  high       DOUBLE PRECISION NOT NULL,
  low        DOUBLE PRECISION NOT NULL,
  close      DOUBLE PRECISION NOT NULL,
  volume     DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (instrument, interval, time)
);

CREATE INDEX IF NOT EXISTS idx_candles_lookup
  ON journal.candles (instrument, interval, time DESC);

-- ── fix_archive.executions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fix_archive.executions (
  exec_id        TEXT             PRIMARY KEY,
  cl_ord_id      TEXT             NOT NULL,
  orig_cl_ord_id TEXT,
  symbol         TEXT             NOT NULL,
  side           TEXT             NOT NULL,
  exec_type      TEXT             NOT NULL,
  ord_status     TEXT             NOT NULL,
  leaves_qty     DOUBLE PRECISION NOT NULL DEFAULT 0,
  cum_qty        DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_px         DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_qty       DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_px        DOUBLE PRECISION NOT NULL DEFAULT 0,
  venue          TEXT,
  counterparty   TEXT,
  commission     DOUBLE PRECISION,
  settl_date     TEXT,
  transact_time  TEXT             NOT NULL,
  ts             TIMESTAMPTZ      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exec_symbol_ts
  ON fix_archive.executions (symbol, ts DESC);

CREATE INDEX IF NOT EXISTS idx_exec_cl_ord_id
  ON fix_archive.executions (cl_ord_id);

CREATE INDEX IF NOT EXISTS idx_exec_orig_cl_ord_id
  ON fix_archive.executions (orig_cl_ord_id) WHERE orig_cl_ord_id IS NOT NULL;

-- ── users.users ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users.users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('trader','admin')),
  avatar_emoji TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users.trading_limits (
  user_id            TEXT             PRIMARY KEY REFERENCES users.users(id),
  max_order_qty      INTEGER          NOT NULL DEFAULT 10000,
  max_daily_notional DOUBLE PRECISION NOT NULL DEFAULT 1000000.0,
  allowed_strategies TEXT             NOT NULL DEFAULT 'LIMIT,TWAP,POV,VWAP'
);

CREATE TABLE IF NOT EXISTS users.sessions (
  token      TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES users.users(id),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON users.sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON users.sessions (user_id);

CREATE TABLE IF NOT EXISTS users.user_preferences (
  user_id TEXT  PRIMARY KEY REFERENCES users.users(id),
  data    JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users.user_alerts (
  id           TEXT        PRIMARY KEY,
  user_id      TEXT        NOT NULL REFERENCES users.users(id),
  severity     TEXT        NOT NULL,
  source       TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  detail       TEXT,
  ts           TIMESTAMPTZ NOT NULL,
  dismissed    BOOLEAN     NOT NULL DEFAULT false,
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user_ts
  ON users.user_alerts (user_id, ts DESC);

CREATE TABLE IF NOT EXISTS users.shared_workspaces (
  id          TEXT        PRIMARY KEY,
  owner_id    TEXT        NOT NULL REFERENCES users.users(id),
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  model_json  JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_workspaces_owner
  ON users.shared_workspaces (owner_id, created_at DESC);

INSERT INTO public.schema_migrations (version) VALUES ('0001_initial')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
