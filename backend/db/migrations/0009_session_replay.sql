CREATE SCHEMA IF NOT EXISTS replay;

CREATE TABLE IF NOT EXISTS replay.sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_role TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS replay.chunks (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES replay.sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  events JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_chunks_session ON replay.chunks (session_id);

CREATE TABLE IF NOT EXISTS replay.config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  recording_enabled BOOLEAN DEFAULT false,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO replay.config (id, recording_enabled) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
