import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type { NelsonSiegelParams } from "./types.ts";

export interface YieldCurveStore {
  insertSnapshot(params: NelsonSiegelParams, source: string): Promise<void>;
  getClosestSnapshot(
    atMs: number,
  ): Promise<
    { params: NelsonSiegelParams; source: string; fetchedAt: number } | null
  >;
}

export function createYieldCurveStore(pool: Pool): YieldCurveStore {
  return {
    async insertSnapshot(
      params: NelsonSiegelParams,
      source: string,
    ): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray("BEGIN");
        await client.queryArray(
          `INSERT INTO intelligence.yield_curve_snapshots (beta0, beta1, beta2, lambda, source, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            params.beta0,
            params.beta1,
            params.beta2,
            params.lambda,
            source,
            Date.now(),
          ],
        );
        // Keep only 365 snapshots (one per day for a year)
        await client.queryArray(
          `DELETE FROM intelligence.yield_curve_snapshots
           WHERE id NOT IN (
             SELECT id FROM intelligence.yield_curve_snapshots ORDER BY fetched_at DESC LIMIT 365
           )`,
        );
        await client.queryArray("COMMIT");
      } catch (err) {
        await client.queryArray("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async getClosestSnapshot(
      atMs: number,
    ): Promise<
      { params: NelsonSiegelParams; source: string; fetchedAt: number } | null
    > {
      const client = await pool.connect();
      try {
        // Find the snapshot closest to (but not after) the requested timestamp,
        // falling back to the oldest available if none precede it.
        const { rows } = await client.queryArray<
          [number, number, number, number, string, bigint | number]
        >(
          `(SELECT beta0, beta1, beta2, lambda, source, fetched_at
            FROM intelligence.yield_curve_snapshots
            WHERE fetched_at <= $1
            ORDER BY fetched_at DESC LIMIT 1)
           UNION ALL
           (SELECT beta0, beta1, beta2, lambda, source, fetched_at
            FROM intelligence.yield_curve_snapshots
            ORDER BY fetched_at ASC LIMIT 1)
           LIMIT 1`,
          [atMs],
        );
        if (rows.length === 0) return null;
        const [beta0, beta1, beta2, lambda, source, fetchedAt] = rows[0];
        return {
          params: {
            beta0: Number(beta0),
            beta1: Number(beta1),
            beta2: Number(beta2),
            lambda: Number(lambda),
          },
          source,
          fetchedAt: Number(fetchedAt),
        };
      } finally {
        client.release();
      }
    },
  };
}
