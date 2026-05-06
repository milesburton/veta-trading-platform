CREATE SCHEMA IF NOT EXISTS scenarios;

CREATE TABLE IF NOT EXISTS scenarios.scenarios (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  spec        JSONB NOT NULL,
  expected    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS scenarios.runs (
  id              TEXT PRIMARY KEY,
  scenario_id     TEXT NOT NULL REFERENCES scenarios.scenarios(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  parent_order_id TEXT,
  actual          JSONB,
  diff            JSONB,
  status          TEXT NOT NULL DEFAULT 'pending',
  error           TEXT
);

CREATE INDEX IF NOT EXISTS runs_by_scenario_idx
  ON scenarios.runs (scenario_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS runs_by_user_idx
  ON scenarios.runs (user_id, triggered_at DESC);

INSERT INTO public.schema_migrations (version) VALUES ('0015_scenarios')
ON CONFLICT (version) DO NOTHING;
