CREATE SCHEMA IF NOT EXISTS risk;

CREATE TABLE IF NOT EXISTS risk.config_versions (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT NOT NULL,
  reason       TEXT,
  config       JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS config_versions_created_at_idx
  ON risk.config_versions (created_at DESC);

INSERT INTO public.schema_migrations (version) VALUES ('0014_risk_config_versions')
ON CONFLICT (version) DO NOTHING;
