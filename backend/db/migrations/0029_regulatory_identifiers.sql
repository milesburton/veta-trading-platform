ALTER TABLE users.trading_limits ADD COLUMN IF NOT EXISTS client_code TEXT;
ALTER TABLE users.trading_limits ADD COLUMN IF NOT EXISTS decision_maker_code TEXT;

INSERT INTO public.schema_migrations (version) VALUES ('0029_regulatory_identifiers')
ON CONFLICT (version) DO NOTHING;
