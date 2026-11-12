ALTER TABLE users.users
  ADD COLUMN IF NOT EXISTS auth_source TEXT NOT NULL DEFAULT 'local'
    CHECK (auth_source IN ('local', 'oidc'));
