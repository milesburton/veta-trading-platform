import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type { FeatureVector } from "../types/intelligence.ts";

const MAX_PER_SYMBOL = 500;

export interface FeatureStore {
  insert(fv: FeatureVector): Promise<void>;
  getLatest(symbol: string): Promise<FeatureVector | null>;
  getHistory(symbol: string, limit: number): Promise<FeatureVector[]>;
  /** Start a background cleanup interval. Returns the interval ID. */
  startCleanup(intervalMs?: number): ReturnType<typeof setInterval>;
}

function rowToFv(r: unknown[]): FeatureVector {
  const [symbol, ts, momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta] =
    r as [string, bigint | number, number, number, number, number, number, number, number];
  return {
    symbol,
    ts: Number(ts),
    momentum: Number(momentum),
    relativeVolume: Number(relativeVolume),
    realisedVol: Number(realisedVol),
    sectorRelativeStrength: Number(sectorRelativeStrength),
    eventScore: Number(eventScore),
    newsVelocity: Number(newsVelocity),
    sentimentDelta: Number(sentimentDelta),
  };
}

export function createFeatureStore(pool: Pool): FeatureStore {
  return {
    async insert(fv: FeatureVector): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO intelligence.feature_vectors
            (symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [fv.symbol, fv.ts, fv.momentum, fv.relativeVolume, fv.realisedVol,
            fv.sectorRelativeStrength, fv.eventScore, fv.newsVelocity, fv.sentimentDelta],
        );
      } finally {
        client.release();
      }
    },

    async getLatest(symbol: string): Promise<FeatureVector | null> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray(
          `SELECT symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta
           FROM intelligence.feature_vectors WHERE symbol = $1 ORDER BY ts DESC LIMIT 1`,
          [symbol],
        );
        return rows.length === 0 ? null : rowToFv(rows[0]);
      } finally {
        client.release();
      }
    },

    async getHistory(symbol: string, limit: number): Promise<FeatureVector[]> {
      const client = await pool.connect();
      try {
        const { rows } = await client.queryArray(
          `SELECT symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta
           FROM intelligence.feature_vectors WHERE symbol = $1 ORDER BY ts DESC LIMIT $2`,
          [symbol, limit],
        );
        return rows.map(rowToFv);
      } finally {
        client.release();
      }
    },

    startCleanup(intervalMs = 5 * 60 * 1000): ReturnType<typeof setInterval> {
      return setInterval(async () => {
        const client = await pool.connect();
        try {
          await client.queryArray(
            `DELETE FROM intelligence.feature_vectors
             WHERE id NOT IN (
               SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY ts DESC) AS rn
                 FROM intelligence.feature_vectors
               ) ranked WHERE rn <= $1
             )`,
            [MAX_PER_SYMBOL],
          );
        } catch (err) {
          console.warn("[feature-store] cleanup error:", (err as Error).message);
        } finally {
          client.release();
        }
      }, intervalMs);
    },
  };
}
