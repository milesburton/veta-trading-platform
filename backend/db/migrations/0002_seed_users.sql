-- Migration 0002: Seed demo users with trading limits
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji) VALUES
  ('alice',  'Alice Chen',      'trader', '👩‍💼'),
  ('bob',    'Bob Kumar',       'trader', '👨‍💻'),
  ('carol',  'Carol Martinez',  'trader', '👩‍🔬'),
  ('dave',   'Dave Thompson',   'trader', '👨‍📊'),
  ('frank',  'Frank Delacroix', 'trader', '🧑‍💼'),
  ('grace',  'Grace Lin',       'trader', '👩‍💻'),
  ('henry',  'Henry Okafor',    'trader', '👨‍🔬'),
  ('iris',   'Iris Nakamura',   'trader', '👩‍📊'),
  ('admin',  'Admin',           'admin',  '🛡️')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  avatar_emoji = EXCLUDED.avatar_emoji;

INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies) VALUES
  ('alice',  10000,  1000000,  'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM'),
  ('bob',    5000,   500000,   'LIMIT,TWAP,POV,VWAP'),
  ('carol',  20000,  2000000,  'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM'),
  ('dave',   2000,   200000,   'LIMIT,TWAP'),
  ('frank',  50000,  5000000,  'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM'),
  ('grace',  10000,  1000000,  'LIMIT,TWAP,POV,VWAP,ICEBERG'),
  ('henry',  15000,  1500000,  'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER'),
  ('iris',   8000,   800000,   'LIMIT,TWAP,POV,VWAP'),
  ('admin',  100000, 10000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM')
ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty      = EXCLUDED.max_order_qty,
  max_daily_notional = EXCLUDED.max_daily_notional,
  allowed_strategies = EXCLUDED.allowed_strategies;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('alice', '{}'), ('bob', '{}'), ('carol', '{}'), ('dave', '{}'),
  ('frank', '{}'), ('grace', '{}'), ('henry', '{}'), ('iris', '{}'), ('admin', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0002_seed_users')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
