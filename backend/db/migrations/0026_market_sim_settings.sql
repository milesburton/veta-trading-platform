CREATE SCHEMA IF NOT EXISTS market_sim;

CREATE TABLE IF NOT EXISTS market_sim.settings (
  key          TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  updated_by   TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations (version) VALUES ('0026_market_sim_settings')
ON CONFLICT (version) DO NOTHING;
