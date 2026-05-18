BEGIN;

ALTER TABLE users.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_password_hash_present
  ON users.users ((password_hash IS NOT NULL));

INSERT INTO public.schema_migrations (version) VALUES ('0020_user_credentials')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
