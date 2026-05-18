BEGIN;

INSERT INTO llm_advisory.runtime_config (id, enabled, worker_enabled, trigger_mode, updated_at, updated_by)
VALUES (1, TRUE, TRUE, 'on-demand-ui', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, 'migration:0019')
ON CONFLICT (id) DO UPDATE
  SET enabled = TRUE,
      worker_enabled = TRUE,
      trigger_mode = CASE
        WHEN llm_advisory.runtime_config.updated_by = 'system' THEN 'on-demand-ui'
        ELSE llm_advisory.runtime_config.trigger_mode
      END,
      updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
      updated_by = 'migration:0019'
  WHERE llm_advisory.runtime_config.updated_by = 'system';

INSERT INTO public.schema_migrations (version) VALUES ('0019_llm_advisory_runtime_config_seed')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
