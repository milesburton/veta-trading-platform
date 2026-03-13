import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type { FeatureVector } from "../types/intelligence.ts";

const MAX_PER_SYMBOL = 500;

export interface FeatureStore {
  insert(fv: FeatureVector): Promise<void>;
  getLatest(symbol: string): Promise<FeatureVector | null>;
  getHistory(symbol: string, limit: number): Promise<FeatureVector[]>;
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
        // Keep only the most recent MAX_PER_SYMBOL rows per symbol
        await client.queryArray(
          `DELETE FROM intelligence.feature_vectors
           WHERE symbol = $1 AND id NOT IN (
             SELECT id FROM intelligence.feature_vectors WHERE symbol = $1 ORDER BY ts DESC LIMIT $2
           )`,
          [fv.symbol, MAX_PER_SYMBOL],
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
  };
}
