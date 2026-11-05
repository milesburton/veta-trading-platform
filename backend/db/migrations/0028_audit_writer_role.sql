DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA audit FROM PUBLIC;

GRANT USAGE ON SCHEMA audit TO audit_writer;
GRANT SELECT, INSERT ON audit.events TO audit_writer;
GRANT EXECUTE ON FUNCTION audit.compute_hash(TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, JSONB) TO audit_writer;
GRANT EXECUTE ON FUNCTION audit.chain_before_insert() TO audit_writer;
GRANT EXECUTE ON FUNCTION audit.reject_mutation() TO audit_writer;
GRANT EXECUTE ON FUNCTION audit.first_broken_seq() TO audit_writer;

INSERT INTO public.schema_migrations (version) VALUES ('0028_audit_writer_role')
ON CONFLICT (version) DO NOTHING;
