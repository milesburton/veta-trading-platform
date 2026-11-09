CREATE SCHEMA IF NOT EXISTS regulatory;

CREATE TABLE IF NOT EXISTS regulatory.order_events (
  seq         BIGINT PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,
  event_type  TEXT NOT NULL,
  ts          TIMESTAMPTZ NOT NULL,
  order_id    TEXT,
  child_id    TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS order_events_ts_idx ON regulatory.order_events (ts);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON regulatory.order_events (order_id, ts);

CREATE OR REPLACE FUNCTION regulatory.compute_hash(
  prev_hash TEXT,
  seq BIGINT,
  event_id TEXT,
  event_type TEXT,
  ts TIMESTAMPTZ,
  order_id TEXT,
  child_id TEXT,
  payload JSONB
) RETURNS TEXT AS $$
  SELECT encode(
    sha256(convert_to(
      concat_ws('|',
        prev_hash,
        seq::text,
        event_id,
        event_type,
        (extract(epoch FROM ts) * 1000000)::bigint::text,
        COALESCE(order_id, ''),
        COALESCE(child_id, ''),
        payload::text
      ),
      'UTF8'
    )),
    'hex'
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION regulatory.chain_before_insert() RETURNS trigger AS $$
DECLARE
  last_seq  BIGINT;
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('regulatory.order_events'));
  SELECT e.seq, e.hash INTO last_seq, last_hash
    FROM regulatory.order_events e ORDER BY e.seq DESC LIMIT 1;
  NEW.seq := COALESCE(last_seq, 0) + 1;
  NEW.prev_hash := COALESCE(last_hash, repeat('0', 64));
  NEW.hash := regulatory.compute_hash(
    NEW.prev_hash, NEW.seq, NEW.event_id, NEW.event_type, NEW.ts,
    NEW.order_id, NEW.child_id, NEW.payload
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION regulatory.reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'regulatory.order_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION regulatory.first_broken_seq() RETURNS BIGINT AS $$
DECLARE
  r             RECORD;
  expected_prev TEXT := repeat('0', 64);
  expected_seq  BIGINT := 1;
BEGIN
  FOR r IN SELECT * FROM regulatory.order_events ORDER BY seq LOOP
    IF r.seq <> expected_seq
       OR r.prev_hash <> expected_prev
       OR r.hash <> regulatory.compute_hash(
            r.prev_hash, r.seq, r.event_id, r.event_type, r.ts,
            r.order_id, r.child_id, r.payload
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

DROP TRIGGER IF EXISTS order_events_chain ON regulatory.order_events;
CREATE TRIGGER order_events_chain
  BEFORE INSERT ON regulatory.order_events
  FOR EACH ROW EXECUTE FUNCTION regulatory.chain_before_insert();

DROP TRIGGER IF EXISTS order_events_no_update ON regulatory.order_events;
CREATE TRIGGER order_events_no_update
  BEFORE UPDATE OR DELETE ON regulatory.order_events
  FOR EACH ROW EXECUTE FUNCTION regulatory.reject_mutation();

DROP TRIGGER IF EXISTS order_events_no_truncate ON regulatory.order_events;
CREATE TRIGGER order_events_no_truncate
  BEFORE TRUNCATE ON regulatory.order_events
  FOR EACH STATEMENT EXECUTE FUNCTION regulatory.reject_mutation();

REVOKE ALL ON SCHEMA regulatory FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA regulatory FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA regulatory FROM PUBLIC;

GRANT USAGE ON SCHEMA regulatory TO audit_writer;
GRANT SELECT, INSERT ON regulatory.order_events TO audit_writer;
GRANT EXECUTE ON FUNCTION regulatory.compute_hash(TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO audit_writer;
GRANT EXECUTE ON FUNCTION regulatory.chain_before_insert() TO audit_writer;
GRANT EXECUTE ON FUNCTION regulatory.reject_mutation() TO audit_writer;
GRANT EXECUTE ON FUNCTION regulatory.first_broken_seq() TO audit_writer;

INSERT INTO public.schema_migrations (version) VALUES ('0030_regulatory_order_events')
ON CONFLICT (version) DO NOTHING;
