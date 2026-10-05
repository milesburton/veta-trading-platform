import { logger } from "@veta/logger";
import { z } from "@veta/zod";
import { ASSET_CLASSES, type AssetClass } from "./market-hours-by-asset-class.ts";

const SETTINGS_KEY = "allow_out_of_hours";
const LOG = { component: "market-hours-settings" };

const assetClassSchema = z.enum(ASSET_CLASSES as [AssetClass, ...AssetClass[]]);

export const marketHoursUpdateSchema = z.object({
  assetClass: assetClassSchema.optional(),
  allowOutOfHours: z.boolean(),
  updatedBy: z.string().min(1).optional(),
});

export type MarketHoursUpdate = z.infer<typeof marketHoursUpdateSchema>;

const storedAllowOutOfHoursSchema = z.record(assetClassSchema, z.boolean());

export function applyMarketHoursUpdate(
  current: Record<AssetClass, boolean>,
  update: MarketHoursUpdate
): Record<AssetClass, boolean> {
  const targets = update.assetClass ? [update.assetClass] : ASSET_CLASSES;
  return Object.fromEntries(
    ASSET_CLASSES.map((ac) => [ac, targets.includes(ac) ? update.allowOutOfHours : current[ac]])
  ) as Record<AssetClass, boolean>;
}

export function mergeStoredAllowOutOfHours(
  defaults: Record<AssetClass, boolean>,
  stored: unknown
): Record<AssetClass, boolean> | null {
  const parsed = storedAllowOutOfHoursSchema.safeParse(stored);
  if (!parsed.success) return null;
  return Object.fromEntries(
    ASSET_CLASSES.map((ac) => [ac, parsed.data[ac] ?? defaults[ac]])
  ) as Record<AssetClass, boolean>;
}

interface QueryClient {
  queryObject<T>(query: string, args?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

export interface SettingsPool {
  connect(): Promise<QueryClient>;
}

export interface MarketHoursSettingsStore {
  load(defaults: Record<AssetClass, boolean>): Promise<Record<AssetClass, boolean> | null>;
  save(value: Record<AssetClass, boolean>, updatedBy: string): Promise<void>;
}

export function createMarketHoursSettingsStore(pool: SettingsPool): MarketHoursSettingsStore {
  return {
    async load(defaults) {
      try {
        const client = await pool.connect();
        try {
          const res = await client.queryObject<{ value: unknown }>(
            `SELECT value FROM market_sim.settings WHERE key = $1`,
            [SETTINGS_KEY]
          );
          if (res.rows.length === 0) return null;
          const merged = mergeStoredAllowOutOfHours(defaults, res.rows[0].value);
          if (!merged) logger.warn("ignoring malformed stored market hours setting", LOG);
          return merged;
        } finally {
          client.release();
        }
      } catch (err) {
        logger.warn("market hours setting load failed; using env default", {
          ...LOG,
          err: err as Error,
        });
        return null;
      }
    },
    async save(value, updatedBy) {
      const client = await pool.connect();
      try {
        await client.queryObject(
          `INSERT INTO market_sim.settings (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [SETTINGS_KEY, JSON.stringify(value), updatedBy]
        );
      } finally {
        client.release();
      }
    },
  };
}
