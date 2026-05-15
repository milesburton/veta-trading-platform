-- 0018_guest_role.sql
-- Adds the `guest` role used by /oauth/guest in user-service for the
-- public/anonymous trade-submission flow (gated by PUBLIC_GUEST_TRADING).
-- Guest users are ephemeral (id = "guest-<12hex>"), never seeded, and
-- rate-limited at the gateway.

BEGIN;

ALTER TABLE users.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'trader',
    'admin',
    'compliance',
    'external-client',
    'sales',
    'viewer',
    'desk-head',
    'risk-manager',
    'oncall',
    'guest'
  ));

INSERT INTO public.schema_migrations (version) VALUES ('0018_guest_role')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
