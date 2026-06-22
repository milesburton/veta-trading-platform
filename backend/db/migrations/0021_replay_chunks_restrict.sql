-- Change the replay.chunks → replay.sessions FK from CASCADE to RESTRICT so
-- that deleting a session row leaves its chunks intact for compliance retention.
-- The DELETE /sessions/{id} handler only removes session metadata; chunks
-- remain queryable and auditable after the session record is gone.
ALTER TABLE replay.chunks
  DROP CONSTRAINT IF EXISTS chunks_session_id_fkey;

ALTER TABLE replay.chunks
  ADD CONSTRAINT chunks_session_id_fkey
    FOREIGN KEY (session_id)
    REFERENCES replay.sessions(id)
    ON DELETE RESTRICT;

INSERT INTO public.schema_migrations (version) VALUES ('0021_replay_chunks_restrict')
  ON CONFLICT (version) DO NOTHING;
