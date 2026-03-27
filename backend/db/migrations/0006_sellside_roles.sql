-- Migration 0006: Sell-side roles — external-client and sales personas
-- Idempotent: all statements use IF NOT EXISTS / IF EXISTS / ON CONFLICT
--
-- Changes:
--   users.users           — add external-client and sales to role CHECK constraint
--   users.users           — add firm column (TEXT NULL) for client affiliation
--   New seed users        — eve (external-client, Goldman Sachs), frank-sales (sales)
--   New trading_limits    — RFQ-only, zero qty/notional limits for both
--   New user_preferences  — empty {} for both

BEGIN;

-- ── users.users: add external-client and sales roles ──────────────────────────

ALTER TABLE users.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('trader', 'admin', 'compliance', 'external-client', 'sales'));

-- ── users.users: add firm column ───────────────────────────────────────────────

ALTER TABLE users.users ADD COLUMN IF NOT EXISTS firm TEXT;

-- ── Seed users ────────────────────────────────────────────────────────────────

INSERT INTO users.users (id, name, role, avatar_emoji)
  VALUES
    ('eve',        'Eve Harrison', 'external-client', '🏦'),
    ('frank-sales','Frank Chen',   'sales',           '🤝')
  ON CONFLICT (id) DO NOTHING;

UPDATE users.users SET firm = 'Goldman Sachs' WHERE id = 'eve';

-- ── Seed trading_limits ───────────────────────────────────────────────────────

INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access)
  VALUES
    ('eve',         0, 0, '', 'rfq',          false),
    ('frank-sales', 0, 0, '', 'rfq,equity,fi', false)
  ON CONFLICT (user_id) DO UPDATE
    SET max_order_qty      = EXCLUDED.max_order_qty,
        max_daily_notional = EXCLUDED.max_daily_notional,
        allowed_strategies = EXCLUDED.allowed_strategies,
        allowed_desks      = EXCLUDED.allowed_desks,
        dark_pool_access   = EXCLUDED.dark_pool_access;

-- ── Seed user_preferences ─────────────────────────────────────────────────────

INSERT INTO users.user_preferences (user_id, data)
  VALUES
    ('eve',         '{}'),
    ('frank-sales', '{}')
  ON CONFLICT (user_id) DO NOTHING;

-- ── Record migration ──────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version) VALUES ('0006_sellside_roles')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
