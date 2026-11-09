ALTER TABLE journal.events ADD COLUMN IF NOT EXISTS ts_micros BIGINT;

INSERT INTO public.schema_migrations (version) VALUES ('0031_journal_ts_micros')
ON CONFLICT (version) DO NOTHING;
