BEGIN;

INSERT INTO users.users (id, name, role, avatar_emoji, description) VALUES
  (
    'loadgen',
    'Load Generator',
    'oncall',
    '🤖',
    'Machine account for the continuous load generator. Signs in with a vault-held password and may only start load tests'
  )
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  role         = EXCLUDED.role,
  avatar_emoji = EXCLUDED.avatar_emoji,
  description  = EXCLUDED.description;

INSERT INTO users.user_preferences (user_id, data) VALUES
  ('loadgen', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0035_loadgen_account')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
