-- Migration 0004: Market data persistence — event calendar snapshots + yield curve history
-- Enables backtesting with historically accurate event scores and yield curve parameters.
-- Idempotent: all CREATE statements use IF NOT EXISTS

BEGIN;

-- ── intelligence.market_events ────────────────────────────────────────────────
-- Persisted snapshots of earnings, economic, and dividend calendar events.
-- Events are upserted by id; fetched_at tracks when the snapshot was taken.

CREATE TABLE IF NOT EXISTS intelligence.market_events (
  id           TEXT   PRIMARY KEY,
  type         TEXT   NOT NULL,       -- 'earnings' | 'economic' | 'dividend' | 'split'
  ticker       TEXT,                  -- NULL for macro events
  headline     TEXT   NOT NULL,
  scheduled_at BIGINT NOT NULL,       -- epoch ms
  impact       TEXT   NOT NULL,       -- 'high' | 'medium' | 'low'
  source       TEXT   NOT NULL DEFAULT 'synthetic',  -- 'finnhub' | 'synthetic'
  fetched_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_events_scheduled
  ON intelligence.market_events (scheduled_at);

CREATE INDEX IF NOT EXISTS idx_market_events_ticker_scheduled
  ON intelligence.market_events (ticker, scheduled_at)
  WHERE ticker IS NOT NULL;

-- ── intelligence.yield_curve_snapshots ───────────────────────────────────────
-- Daily Nelson-Siegel parameter snapshots fitted from FRED Treasury rates.
-- Used by the replay server to reconstruct the yield curve at any past timestamp.

CREATE TABLE IF NOT EXISTS intelligence.yield_curve_snapshots (
  id         BIGSERIAL        PRIMARY KEY,
  beta0      DOUBLE PRECISION NOT NULL,
  beta1      DOUBLE PRECISION NOT NULL,
  beta2      DOUBLE PRECISION NOT NULL,
  lambda     DOUBLE PRECISION NOT NULL,
  source     TEXT             NOT NULL DEFAULT 'synthetic',  -- 'fred' | 'synthetic'
  fetched_at BIGINT           NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_yield_curve_fetched
  ON intelligence.yield_curve_snapshots (fetched_at DESC);

INSERT INTO public.schema_migrations (version) VALUES ('0004_market_data')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
