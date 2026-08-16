-- FIX NewOrderSingle's Account tag (1) was previously read but discarded by
-- fix-exchange.ts. Add a nullable column so archived executions can carry
-- sub-account attribution through to fix-archive; existing rows have no
-- account information and stay NULL.
ALTER TABLE fix_archive.executions
  ADD COLUMN IF NOT EXISTS account TEXT;

INSERT INTO public.schema_migrations (version) VALUES ('0024_fix_archive_account')
  ON CONFLICT (version) DO NOTHING;
