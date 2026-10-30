CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.events (
  seq         BIGINT PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    TEXT NOT NULL,
  actor_role  TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_ts_idx ON audit.events (ts DESC);
CREATE INDEX IF NOT EXISTS events_actor_idx ON audit.events (actor_id, ts DESC);

CREATE OR REPLACE FUNCTION audit.compute_hash(
  prev_hash TEXT,
  seq BIGINT,
  ts TIMESTAMPTZ,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT,
  target TEXT,
  detail JSONB
) RETURNS TEXT AS $$
  SELECT encode(
    sha256(convert_to(
      concat_ws('|',
        prev_hash,
        seq::text,
        (extract(epoch FROM ts) * 1000000)::bigint::text,
        actor_id,
        actor_role,
        action,
        COALESCE(target, ''),
        detail::text
      ),
      'UTF8'
    )),
    'hex'
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION audit.chain_before_insert() RETURNS trigger AS $$
DECLARE
  last_seq  BIGINT;
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit.events'));
  SELECT e.seq, e.hash INTO last_seq, last_hash
    FROM audit.events e ORDER BY e.seq DESC LIMIT 1;
  NEW.seq := COALESCE(last_seq, 0) + 1;
  NEW.prev_hash := COALESCE(last_hash, repeat('0', 64));
  NEW.hash := audit.compute_hash(
    NEW.prev_hash, NEW.seq, NEW.ts, NEW.actor_id, NEW.actor_role,
    NEW.action, NEW.target, NEW.detail
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit.reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit.events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit.first_broken_seq() RETURNS BIGINT AS $$
DECLARE
  r             RECORD;
  expected_prev TEXT := repeat('0', 64);
  expected_seq  BIGINT := 1;
BEGIN
  FOR r IN SELECT * FROM audit.events ORDER BY seq LOOP
    IF r.seq <> expected_seq
       OR r.prev_hash <> expected_prev
       OR r.hash <> audit.compute_hash(
            r.prev_hash, r.seq, r.ts, r.actor_id, r.actor_role,
            r.action, r.target, r.detail
          )
    THEN
      RETURN r.seq;
    END IF;
    expected_prev := r.hash;
    expected_seq := expected_seq + 1;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

DROP TRIGGER IF EXISTS events_chain ON audit.events;
CREATE TRIGGER events_chain
  BEFORE INSERT ON audit.events
  FOR EACH ROW EXECUTE FUNCTION audit.chain_before_insert();

DROP TRIGGER IF EXISTS events_no_update ON audit.events;
CREATE TRIGGER events_no_update
  BEFORE UPDATE OR DELETE ON audit.events
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

DROP TRIGGER IF EXISTS events_no_truncate ON audit.events;
CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON audit.events
  FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();

INSERT INTO public.schema_migrations (version) VALUES ('0027_audit_log')
ON CONFLICT (version) DO NOTHING;
