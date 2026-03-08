import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import type { LlmPolicy, LlmRuntimeConfig, LlmSubsystemState, LlmTriggerMode } from "../types/llm-advisory.ts";

export class RuntimeConfigStore {
  private db: DB;

  constructor(dbPath: string) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) Deno.mkdirSync(dir, { recursive: true });

    this.db = new DB(dbPath);
    this.db.query("PRAGMA journal_mode=WAL");
    this.db.query("PRAGMA synchronous=NORMAL");
    this.db.query("PRAGMA busy_timeout=10000");
    this.db.query(`
      CREATE TABLE IF NOT EXISTS llm_runtime_config (
        id           INTEGER PRIMARY KEY CHECK(id = 1),
        enabled      INTEGER NOT NULL DEFAULT 0,
        worker_enabled INTEGER NOT NULL DEFAULT 0,
        trigger_mode TEXT NOT NULL DEFAULT 'manual',
        updated_at   INTEGER NOT NULL,
        updated_by   TEXT NOT NULL DEFAULT 'system'
      )
    `);

    const existing = [...this.db.query("SELECT id FROM llm_runtime_config WHERE id = 1")];
    if (existing.length === 0) {
      this.db.query(
        "INSERT INTO llm_runtime_config (id, enabled, worker_enabled, trigger_mode, updated_at, updated_by) VALUES (1, 0, 0, 'manual', ?, 'system')",
        [Date.now()],
      );
    }
  }

  getConfig(): LlmRuntimeConfig {
    const rows = [
      ...this.db.query<[number, number, string, number, string]>(
        "SELECT enabled, worker_enabled, trigger_mode, updated_at, updated_by FROM llm_runtime_config WHERE id = 1",
      ),
    ];
    if (rows.length === 0) {
      return { enabled: false, workerEnabled: false, triggerMode: "manual", updatedAt: Date.now(), updatedBy: "system" };
    }
    const [enabled, workerEnabled, triggerMode, updatedAt, updatedBy] = rows[0];
    return {
      enabled: enabled === 1,
      workerEnabled: workerEnabled === 1,
      triggerMode: triggerMode as LlmTriggerMode,
      updatedAt,
      updatedBy,
    };
  }

  updateConfig(patch: Partial<Omit<LlmRuntimeConfig, "updatedAt">>, updatedBy: string): LlmRuntimeConfig {
    const current = this.getConfig();
    const next: LlmRuntimeConfig = {
      enabled: patch.enabled ?? current.enabled,
      workerEnabled: patch.workerEnabled ?? current.workerEnabled,
      triggerMode: patch.triggerMode ?? current.triggerMode,
      updatedAt: Date.now(),
      updatedBy,
    };
    this.db.query(
      "UPDATE llm_runtime_config SET enabled=?, worker_enabled=?, trigger_mode=?, updated_at=?, updated_by=? WHERE id=1",
      [next.enabled ? 1 : 0, next.workerEnabled ? 1 : 0, next.triggerMode, next.updatedAt, next.updatedBy],
    );
    return next;
  }

  close(): void {
    this.db.close();
  }
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
  if (lastActivityMs !== null && Date.now() - lastActivityMs < minRefreshMs) return "cooldown";

  return "armed";
}
