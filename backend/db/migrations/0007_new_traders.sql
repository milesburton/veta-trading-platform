-- Migration 0007: Add new trader users across equity, fx, and commodities desks
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE
--
-- New users:
--   james  — senior high-touch equity trader, large limits, dark pool
--   sofia  — junior low-touch equity, tight limits
--   omar   — options/derivatives specialist with equity access
--   priya  — pure options trader, dedicated derivatives desk
--   luca   — FX specialist, high notional, dark pool
--   yuki   — cross FX+commodities trader
--   rajesh — commodities specialist (oil, metals, agriculture), dark pool
--   amelia — cross equity+FX, medium limits

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji) VALUES
  ('james',  'James Okafor',  'trader', '👨‍💼'),
  ('sofia',  'Sofia Reyes',   'trader', '👩‍🎨'),
  ('omar',   'Omar Hassan',   'trader', '👨‍🔬'),
  ('priya',  'Priya Sharma',  'trader', '👩‍💻'),
  ('luca',   'Luca Ferrari',  'trader', '🧑‍🎯'),
  ('yuki',   'Yuki Tanaka',   'trader', '👩‍🔬'),
  ('rajesh', 'Rajesh Patel',  'trader', '👨‍💻'),
  ('amelia', 'Amelia Brooks', 'trader', '👩‍🎓')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  avatar_emoji = EXCLUDED.avatar_emoji;

INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access) VALUES
  ('james',  25000, 2500000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM', 'equity',             true),
  ('sofia',  1000,  100000,  'LIMIT,TWAP',                                                    'equity',             false),
  ('omar',   15000, 1500000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER',                           'equity,derivatives', false),
  ('priya',  20000, 2000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE',             'derivatives',        false),
  ('luca',   50000, 5000000, 'LIMIT,TWAP,POV,VWAP',                                          'fx',                 true),
  ('yuki',   30000, 3000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG',                                  'fx,commodities',     false),
  ('rajesh', 40000, 4000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER',                           'commodities',        true),
  ('amelia', 10000, 1000000, 'LIMIT,TWAP,POV,VWAP',                                          'equity,fx',          false)
ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty      = EXCLUDED.max_order_qty,
  max_daily_notional = EXCLUDED.max_daily_notional,
  allowed_strategies = EXCLUDED.allowed_strategies,
  allowed_desks      = EXCLUDED.allowed_desks,
  dark_pool_access   = EXCLUDED.dark_pool_access;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('james', '{}'), ('sofia', '{}'), ('omar', '{}'), ('priya', '{}'),
  ('luca', '{}'), ('yuki', '{}'), ('rajesh', '{}'), ('amelia', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0007_new_traders')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
