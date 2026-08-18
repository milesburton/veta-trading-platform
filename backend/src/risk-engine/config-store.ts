import { riskPool } from "@veta/db";
import { logger } from "@veta/logger";
import type { RiskConfig } from "@veta/schemas/risk";

export interface ConfigVersion {
  id: number;
  createdAt: string;
  createdBy: string;
  reason: string | null;
  config: RiskConfig;
}

export interface ConfigStore {
  current(): { id: number; config: RiskConfig };
  load(): Promise<void>;
  save(next: RiskConfig, opts: { createdBy: string; reason?: string }): Promise<ConfigVersion>;
  history(limit?: number): Promise<ConfigVersion[]>;
  versionId(): number;
}

const LOG = { component: "risk-config-store" };

export function createConfigStore(initial: RiskConfig): ConfigStore {
  let cached: RiskConfig = { ...initial };
  let cachedId = 0;

  const pool = riskPool;

  return {
    current() {
      return { id: cachedId, config: cached };
    },
    versionId() {
      return cachedId;
    },
    async load() {
      try {
        const client = await pool.connect();
        try {
          const res = await client.queryObject<{
            id: number;
            config: RiskConfig;
          }>(
            `SELECT id, config FROM risk.config_versions
              ORDER BY id DESC
              LIMIT 1`
          );
          if (res.rows.length > 0) {
            cached = { ...initial, ...res.rows[0].config };
            cachedId = Number(res.rows[0].id);
            logger.info("loaded risk config from db", { ...LOG, version: cachedId });
            return;
          }
          const seedRes = await client.queryObject<{ id: number }>(
            `INSERT INTO risk.config_versions (created_by, reason, config)
             VALUES ($1, $2, $3)
             RETURNING id`,
            ["system", "initial seed", JSON.stringify(initial)]
          );
          cachedId = Number(seedRes.rows[0].id);
          logger.info("seeded initial risk config", { ...LOG, version: cachedId });
        } finally {
          client.release();
        }
      } catch (err) {
        logger.warn("risk config load failed; using in-memory defaults", {
          ...LOG,
          err: err as Error,
        });
      }
    },
    async save(next, opts) {
      const client = await pool.connect();
      try {
        const res = await client.queryObject<{
          id: number;
          created_at: string;
          created_by: string;
          reason: string | null;
          config: RiskConfig;
        }>(
          `INSERT INTO risk.config_versions (created_by, reason, config)
           VALUES ($1, $2, $3)
           RETURNING id, created_at, created_by, reason, config`,
          [opts.createdBy, opts.reason ?? null, JSON.stringify(next)]
        );
        const row = res.rows[0];
        cached = { ...next };
        cachedId = Number(row.id);
        logger.info("saved new risk config version", {
          ...LOG,
          version: cachedId,
          createdBy: opts.createdBy,
        });
        return {
          id: Number(row.id),
          createdAt: row.created_at,
          createdBy: row.created_by,
          reason: row.reason,
          config: row.config,
        };
      } finally {
        client.release();
      }
    },
    async history(limit = 50) {
      const client = await pool.connect();
      try {
        const res = await client.queryObject<{
          id: number;
          created_at: string;
          created_by: string;
          reason: string | null;
          config: RiskConfig;
        }>(
          `SELECT id, created_at, created_by, reason, config
             FROM risk.config_versions
            ORDER BY id DESC
            LIMIT $1`,
          [limit]
        );
        return res.rows.map((r) => ({
          id: Number(r.id),
          createdAt: r.created_at,
          createdBy: r.created_by,
          reason: r.reason,
          config: r.config,
        }));
      } finally {
        client.release();
      }
    },
  };
}
