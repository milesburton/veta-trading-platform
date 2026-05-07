-- Adds a test-only trader user with permissions for all 9 algo strategies.
--
-- Background: migration 0010_trader_personas restricted each canonical trader
-- to a realistic sub-set of strategies. After 0010, no `role='trader'` user has
-- IS or MOMENTUM permissions — only `admin` does, and OMS rejects orders from
-- the admin role. The result is that algo.integration tests for IS, MOMENTUM,
-- and SNIPER (which alice lost) silently fail with "Strategy X is not
-- permitted for your account" — masked previously by `continue-on-error: true`
-- on the legacy CI step.
--
-- Adding a dedicated `test-full-trader` user keeps the persona design intact
-- (alice et al stay realistic) while giving the integration suite a single
-- account that can exercise every strategy end-to-end.
--
-- The user uses the standard OAUTH2_SHARED_SECRET like every other seeded
-- user. It WILL appear in the trader picker — that's acceptable for a learning
-- platform; readers can see what a "all powers enabled" persona looks like.

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji, description)
  VALUES ('test-full-trader', 'Test Full Trader', 'trader', '🧪',
          'Integration-test only — trader with all 9 algo strategies enabled')
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    role             = EXCLUDED.role,
    avatar_emoji     = EXCLUDED.avatar_emoji,
    description      = EXCLUDED.description;

INSERT INTO users.trading_limits (
  user_id, max_order_qty, max_daily_notional, allowed_strategies,
  allowed_desks, dark_pool_access, trading_style, primary_desk
) VALUES (
  'test-full-trader', 50000, 5000000,
  'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM',
  'equity,fi,derivatives,fx,commodities', true,
  'low_touch', 'cross-desk'
) ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty       = EXCLUDED.max_order_qty,
  max_daily_notional  = EXCLUDED.max_daily_notional,
  allowed_strategies  = EXCLUDED.allowed_strategies,
  allowed_desks       = EXCLUDED.allowed_desks,
  dark_pool_access    = EXCLUDED.dark_pool_access,
  trading_style       = EXCLUDED.trading_style,
  primary_desk        = EXCLUDED.primary_desk;

INSERT INTO users.user_preferences (user_id, data) VALUES ('test-full-trader', '{}')
  ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0016_test_full_strategies_trader')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
