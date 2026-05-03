-- Migration 0013: journal.events — capture event arrival time at the journal
--
-- `ts` is the event-source timestamp (set by the producer). To measure
-- end-to-end pipeline latency we also need to know when the journal *received*
-- and persisted each event. This column is set by the writer at flush time.
--
-- Idempotent.

BEGIN;

ALTER TABLE journal.events
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_order_id_type_ts
  ON journal.events (order_id, event_type, ts)
  WHERE order_id IS NOT NULL;

INSERT INTO public.schema_migrations (version) VALUES ('0013_journal_arrived_at')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
