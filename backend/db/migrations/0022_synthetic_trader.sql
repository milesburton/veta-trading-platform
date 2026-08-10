-- Migration 0022: Seed the synthetic trader agent's user account
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE
--
-- Password is NOT set here (no password_hash). Auth falls through to
-- OAUTH2_USER_SECRETS (see verifyOAuthCredentials in user-service.ts),
-- same mechanism as every other automation account in this project.
-- Add an entry for synthetic-trader-1 to the homelab's OAUTH2_USER_SECRETS
-- env value; never OAUTH2_SHARED_SECRET.

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji) VALUES
  ('synthetic-trader-1', 'Synthetic Trader', 'trader', '🤖')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  avatar_emoji = EXCLUDED.avatar_emoji;

INSERT INTO users.trading_limits (user_id, max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access) VALUES
  ('synthetic-trader-1', 10000, 1000000, 'LIMIT,TWAP,POV,VWAP,ICEBERG,ARRIVAL_PRICE', 'equity', false)
ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty      = EXCLUDED.max_order_qty,
  max_daily_notional = EXCLUDED.max_daily_notional,
  allowed_strategies = EXCLUDED.allowed_strategies,
  allowed_desks      = EXCLUDED.allowed_desks,
  dark_pool_access   = EXCLUDED.dark_pool_access;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('synthetic-trader-1', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0022_synthetic_trader')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
