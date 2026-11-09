ALTER TABLE scenarios.runs ADD COLUMN IF NOT EXISTS algo_id TEXT;
ALTER TABLE scenarios.runs ADD COLUMN IF NOT EXISTS algo_version TEXT;
ALTER TABLE scenarios.runs ADD COLUMN IF NOT EXISTS commit_sha TEXT;

CREATE INDEX IF NOT EXISTS runs_by_algo_idx
  ON scenarios.runs (algo_id, triggered_at DESC);

INSERT INTO public.schema_migrations (version) VALUES ('0032_scenario_run_algo_evidence')
ON CONFLICT (version) DO NOTHING;
