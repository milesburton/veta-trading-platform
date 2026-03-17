-- Migration 0002: Seed demo users with trading limits
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji) VALUES
  ('alice',      'Alice Chen',        'trader',     '👩‍💼'),
  ('bob',        'Bob Kumar',         'trader',     '👨‍💻'),
  ('carol',      'Carol Martinez',    'trader',     '👩‍🔬'),
  ('dave',       'Dave Thompson',     'trader',     '👨‍📊'),
  ('frank',      'Frank Delacroix',   'trader',     '🧑‍💼'),
  ('grace',      'Grace Lin',         'trader',     '👩‍💻'),
  ('henry',      'Henry Okafor',      'trader',     '👨‍🔬'),
  ('iris',       'Iris Nakamura',     'trader',     '👩‍📊'),
  ('compliance', 'Sam Rivera',        'compliance', '🔍'),
  ('admin',      'Admin',             'admin',      '🛡️')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  avatar_emoji = EXCLUDED.avatar_emoji;

-- Desk assignments:
--   alice   — equity high-touch trader
--   bob     — equity low-touch / algo trader
--   carol   — FI desk trader
--   dave    — junior equity trader (equity only, no dark pool)
--   frank   — senior cross-desk trader (all desks, dark pool access)
--   grace   — equity + derivatives trader
--   henry   — FI + derivatives
--   iris    — equity low-touch
--   compliance — read-only compliance officer (no trading limits needed)
--   admin   — all desks, all access

INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access) VALUES
  ('alice',      10000,  1000000,   'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM', 'equity',                    false),
  ('bob',        5000,   500000,    'LIMIT,TWAP,POV,VWAP',                                           'equity',                    true),
  ('carol',      20000,  2000000,   'LIMIT',                                                         'fi',                        false),
  ('dave',       2000,   200000,    'LIMIT,TWAP',                                                    'equity',                    false),
  ('frank',      50000,  5000000,   'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM', 'equity,fi,derivatives',     true),
  ('grace',      10000,  1000000,   'LIMIT,TWAP,POV,VWAP,ICEBERG',                                  'equity,derivatives',        false),
  ('henry',      15000,  1500000,   'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER',                           'fi,derivatives',            false),
  ('iris',       8000,   800000,    'LIMIT,TWAP,POV,VWAP',                                           'equity',                    true),
  ('compliance', 0,      0,         '',                                                              'equity,fi,derivatives',     false),
  ('admin',      100000, 10000000,  'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM', 'equity,fi,derivatives',     true)
ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty      = EXCLUDED.max_order_qty,
  max_daily_notional = EXCLUDED.max_daily_notional,
  allowed_strategies = EXCLUDED.allowed_strategies,
  allowed_desks      = EXCLUDED.allowed_desks,
  dark_pool_access   = EXCLUDED.dark_pool_access;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('alice', '{}'), ('bob', '{}'), ('carol', '{}'), ('dave', '{}'),
  ('frank', '{}'), ('grace', '{}'), ('henry', '{}'), ('iris', '{}'),
  ('compliance', '{}'), ('admin', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0002_seed_users')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
