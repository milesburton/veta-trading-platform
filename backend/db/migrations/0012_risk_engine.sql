BEGIN;

CREATE SCHEMA IF NOT EXISTS risk;

CREATE TABLE IF NOT EXISTS risk.config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fat_finger_pct DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  max_open_orders INTEGER NOT NULL DEFAULT 50,
  duplicate_window_ms INTEGER NOT NULL DEFAULT 500,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO risk.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS risk.events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT NOT NULL,
  order_id TEXT,
  check_name TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'reject', 'warn')),
  detail JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_risk_events_ts ON risk.events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_user ON risk.events (user_id, ts DESC);

INSERT INTO public.schema_migrations (version) VALUES ('0012_risk_engine')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
