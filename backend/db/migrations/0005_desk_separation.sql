-- Migration 0005: Desk separation — information barriers, compliance role, dark pool access
-- Idempotent: all statements use IF NOT EXISTS / IF EXISTS / ON CONFLICT
--
-- Changes:
--   journal.events        — add desk, market_type columns + desk index
--   fix_archive.executions — add desk, market_type columns
--   users.users           — add compliance to role CHECK constraint
--   users.trading_limits  — add allowed_desks, dark_pool_access columns
--   New schemas           — ccp, rfq, surveillance (empty, populated by later migrations)

BEGIN;

-- ── journal.events: desk + market_type ────────────────────────────────────────

ALTER TABLE journal.events
  ADD COLUMN IF NOT EXISTS desk        TEXT,
  ADD COLUMN IF NOT EXISTS market_type TEXT;

CREATE INDEX IF NOT EXISTS idx_events_desk_ts
  ON journal.events (desk, ts DESC)
  WHERE desk IS NOT NULL;

-- ── fix_archive.executions: desk + market_type ────────────────────────────────

ALTER TABLE fix_archive.executions
  ADD COLUMN IF NOT EXISTS desk        TEXT,
  ADD COLUMN IF NOT EXISTS market_type TEXT;

-- ── users.users: add compliance role ──────────────────────────────────────────

ALTER TABLE users.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('trader', 'admin', 'compliance'));

-- ── users.trading_limits: desk access + dark pool ─────────────────────────────

ALTER TABLE users.trading_limits
  ADD COLUMN IF NOT EXISTS allowed_desks    TEXT    NOT NULL DEFAULT 'equity',
  ADD COLUMN IF NOT EXISTS dark_pool_access BOOLEAN NOT NULL DEFAULT false;

-- ── Reserve schemas for upcoming phases ───────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS ccp;
CREATE SCHEMA IF NOT EXISTS rfq;
CREATE SCHEMA IF NOT EXISTS surveillance;

-- ── Record migration ──────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version) VALUES ('0005_desk_separation')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
