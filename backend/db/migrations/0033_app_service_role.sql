DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    CREATE ROLE app_service NOLOGIN;
  END IF;
END
$$;

DO $$
DECLARE
  app_schema TEXT;
BEGIN
  FOREACH app_schema IN ARRAY ARRAY[
    'journal',
    'fix_archive',
    'users',
    'intelligence',
    'llm_advisory',
    'ccp',
    'rfq',
    'surveillance',
    'replay',
    'risk',
    'scenarios',
    'market_sim'
  ]
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_service', app_schema);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO app_service',
      app_schema
    );
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO app_service', app_schema);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_service',
      app_schema
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO app_service',
      app_schema
    );
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA audit TO app_service;
GRANT SELECT, INSERT ON audit.events TO app_service;
GRANT EXECUTE ON FUNCTION audit.compute_hash(TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB) TO app_service;

INSERT INTO public.schema_migrations (version) VALUES ('0033_app_service_role')
ON CONFLICT (version) DO NOTHING;
