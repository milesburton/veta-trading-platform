import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type {
  LlmPolicy,
  LlmRuntimeConfig,
  LlmSubsystemState,
  LlmTriggerMode,
} from "../types/llm-advisory.ts";

export interface RuntimeConfigStore {
  getConfig(): Promise<LlmRuntimeConfig>;
  updateConfig(
    patch: Partial<Omit<LlmRuntimeConfig, "updatedAt">>,
    updatedBy: string,
  ): Promise<LlmRuntimeConfig>;
}

export async function createRuntimeConfigStore(
  pool: Pool,
): Promise<RuntimeConfigStore> {
  // Ensure default row exists
  const client = await pool.connect();
  try {
    await client.queryArray(
      `INSERT INTO llm_advisory.runtime_config (id, enabled, worker_enabled, trigger_mode, updated_at, updated_by)
       VALUES (1, FALSE, FALSE, 'manual', $1, 'system')
       ON CONFLICT (id) DO NOTHING`,
      [Date.now()],
    );
  } finally {
    client.release();
  }

  async function getConfig(): Promise<LlmRuntimeConfig> {
    const c = await pool.connect();
    try {
      const { rows } = await c.queryArray<
        [boolean, boolean, string, bigint | number, string]
      >(
        "SELECT enabled, worker_enabled, trigger_mode, updated_at, updated_by FROM llm_advisory.runtime_config WHERE id = 1",
      );
      if (rows.length === 0) {
        return {
          enabled: false,
          workerEnabled: false,
          triggerMode: "manual",
          updatedAt: Date.now(),
          updatedBy: "system",
        };
      }
      const [enabled, workerEnabled, triggerMode, updatedAt, updatedBy] =
        rows[0];
      return {
        enabled: Boolean(enabled),
        workerEnabled: Boolean(workerEnabled),
        triggerMode: triggerMode as LlmTriggerMode,
        updatedAt: Number(updatedAt),
        updatedBy,
      };
    } finally {
      c.release();
    }
  }

  return {
    getConfig,

    async updateConfig(
      patch: Partial<Omit<LlmRuntimeConfig, "updatedAt">>,
      updatedBy: string,
    ): Promise<LlmRuntimeConfig> {
      const current = await getConfig();
      const next: LlmRuntimeConfig = {
        enabled: patch.enabled ?? current.enabled,
        workerEnabled: patch.workerEnabled ?? current.workerEnabled,
        triggerMode: patch.triggerMode ?? current.triggerMode,
        updatedAt: Date.now(),
        updatedBy,
      };
      const c = await pool.connect();
      try {
        await c.queryArray(
          `UPDATE llm_advisory.runtime_config
           SET enabled=$1, worker_enabled=$2, trigger_mode=$3, updated_at=$4, updated_by=$5
           WHERE id=1`,
          [
            next.enabled,
            next.workerEnabled,
            next.triggerMode,
            next.updatedAt,
            next.updatedBy,
          ],
        );
      } finally {
        c.release();
      }
      return next;
    },
  };
}

export function resolveEffectivePolicy(
  basePolicy: LlmPolicy,
  runtimeConfig: LlmRuntimeConfig,
): LlmPolicy {
  return {
    ...basePolicy,
    enabled: runtimeConfig.enabled,
    workerEnabled: runtimeConfig.workerEnabled,
    triggerMode: runtimeConfig.triggerMode,
  };
}

export function deriveSubsystemState(
  effectivePolicy: LlmPolicy,
  pendingJobs: number,
  lastErrorMs: number | null,
  lastActivityMs: number | null,
): LlmSubsystemState {
  if (!effectivePolicy.enabled) return "disabled";
  if (lastErrorMs !== null && Date.now() - lastErrorMs < 30_000) return "error";
  if (pendingJobs > 0) return "active";
  const minRefreshMs = effectivePolicy.minRefreshMinutes * 60 * 1000;
  if (lastActivityMs !== null && Date.now() - lastActivityMs < minRefreshMs) {
    return "cooldown";
  }
  return "armed";
}
