-- Migration 0023: Seed accounts for all eight synthetic-trader desk instances
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE
--
-- Supersedes the single equity-only account from migration 0022 (kept, not
-- removed, since 0022 already shipped and its row is idempotent to re-run).
-- One account per archetype in shared/traderArchetypes.ts, id
-- synthetic-trader-<archetype-id>, trading_limits copied directly from that
-- archetype's own allowedStrategies/allowedDesks/darkPoolAccess plus the
-- shared STARTER_MAX_ORDER_QTY (10000) / STARTER_MAX_DAILY_NOTIONAL
-- (1000000) constants.
--
-- Passwords are NOT set here (no password_hash). Auth falls through to
-- OAUTH2_USER_SECRETS (see verifyOAuthCredentials in user-service.ts), same
-- mechanism as every other automation account in this project. Add an entry
-- per account id to the homelab's OAUTH2_USER_SECRETS env value; never
-- OAUTH2_SHARED_SECRET.

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji) VALUES
  ('synthetic-trader-equity-high-touch',      'Synthetic Trader (Equity HT)',       'trader', '🤖'),
  ('synthetic-trader-equity-low-touch',       'Synthetic Trader (Equity LT)',       'trader', '🤖'),
  ('synthetic-trader-fi-voice',               'Synthetic Trader (FI Voice)',        'trader', '🤖'),
  ('synthetic-trader-fx-electronic',          'Synthetic Trader (FX Electronic)',   'trader', '🤖'),
  ('synthetic-trader-fx-high-touch',          'Synthetic Trader (FX HT)',           'trader', '🤖'),
  ('synthetic-trader-derivatives-high-touch', 'Synthetic Trader (Derivatives HT)',  'trader', '🤖'),
  ('synthetic-trader-derivatives-low-touch',  'Synthetic Trader (Derivatives LT)',  'trader', '🤖'),
  ('synthetic-trader-commodities-voice',      'Synthetic Trader (Commodities)',     'trader', '🤖')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  avatar_emoji = EXCLUDED.avatar_emoji;

INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access) VALUES
  ('synthetic-trader-equity-high-touch',      10000, 1000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,ARRIVAL_PRICE', 'equity',      false),
  ('synthetic-trader-equity-low-touch',       10000, 1000000, 'LIMIT,TWAP,POV,VWAP',                        'equity',      false),
  ('synthetic-trader-fi-voice',               10000, 1000000, 'LIMIT',                                      'fi',          false),
  ('synthetic-trader-fx-electronic',          10000, 1000000, 'LIMIT,TWAP,POV,VWAP',                        'fx',          true),
  ('synthetic-trader-fx-high-touch',          10000, 1000000, 'LIMIT,TWAP',                                 'fx',          false),
  ('synthetic-trader-derivatives-high-touch', 10000, 1000000, 'LIMIT,TWAP,POV,ICEBERG',                     'derivatives', false),
  ('synthetic-trader-derivatives-low-touch',  10000, 1000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG',                'derivatives', false),
  ('synthetic-trader-commodities-voice',      10000, 1000000, 'LIMIT',                                      'commodities', false)
ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty      = EXCLUDED.max_order_qty,
  max_daily_notional = EXCLUDED.max_daily_notional,
  allowed_strategies = EXCLUDED.allowed_strategies,
  allowed_desks      = EXCLUDED.allowed_desks,
  dark_pool_access   = EXCLUDED.dark_pool_access;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('synthetic-trader-equity-high-touch', '{}'),
  ('synthetic-trader-equity-low-touch', '{}'),
  ('synthetic-trader-fi-voice', '{}'),
  ('synthetic-trader-fx-electronic', '{}'),
  ('synthetic-trader-fx-high-touch', '{}'),
  ('synthetic-trader-derivatives-high-touch', '{}'),
  ('synthetic-trader-derivatives-low-touch', '{}'),
  ('synthetic-trader-commodities-voice', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0023_synthetic_trader_desks')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
