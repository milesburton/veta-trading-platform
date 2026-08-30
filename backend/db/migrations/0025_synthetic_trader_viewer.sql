-- Migration 0025: Read-only login persona for observing the synthetic trader
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING / DO UPDATE
--
-- The synthetic-trader-* accounts (0022, 0023) are 'trader' role so the
-- bot service can place real orders. This adds a separate account with the
-- same name/avatar but role 'viewer', so a human can select "Synthetic
-- Trader" from the login persona picker and watch it run without being
-- able to submit orders as it. Role 'viewer' is already rejected at the
-- gateway (websocket.ts submitOrder) and OMS, so no new enforcement code
-- is required.
--
-- Password is NOT set here (no password_hash). Auth falls through to
-- OAUTH2_SHARED_SECRET like every other demo persona (see
-- verifyOAuthCredentials in user-service.ts).

BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji, description) VALUES
  ('synthetic-trader-1-viewer', 'Synthetic Trader', 'viewer', '🤖',
   'Read-only view of the always-on synthetic trader — watch it place orders, cannot trade')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  role         = EXCLUDED.role,
  avatar_emoji = EXCLUDED.avatar_emoji,
  description  = EXCLUDED.description;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('synthetic-trader-1-viewer', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0025_synthetic_trader_viewer')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
