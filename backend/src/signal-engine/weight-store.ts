import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type { FeatureName } from "../types/intelligence.ts";

export type WeightMap = Record<FeatureName, number>;

export const DEFAULT_WEIGHTS: WeightMap = {
  momentum: 0.25,
  relativeVolume: 0.10,
  realisedVol: -0.15,
  sectorRelativeStrength: 0.20,
  eventScore: 0.10,
  newsVelocity: 0.10,
  sentimentDelta: 0.10,
};

export interface WeightStore {
  getWeights(): Promise<WeightMap>;
  saveWeights(weights: WeightMap): Promise<void>;
}

export async function createWeightStore(pool: Pool): Promise<WeightStore> {
  // Ensure a default row exists
  const client = await pool.connect();
  try {
    const { rows } = await client.queryArray(
      "SELECT id FROM intelligence.signal_weights WHERE id = 1",
    );
    if (rows.length === 0) {
      await client.queryArray(
        `INSERT INTO intelligence.signal_weights
          (id, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          DEFAULT_WEIGHTS.momentum, DEFAULT_WEIGHTS.relativeVolume, DEFAULT_WEIGHTS.realisedVol,
          DEFAULT_WEIGHTS.sectorRelativeStrength, DEFAULT_WEIGHTS.eventScore,
          DEFAULT_WEIGHTS.newsVelocity, DEFAULT_WEIGHTS.sentimentDelta, Date.now(),
        ],
      );
    }
  } finally {
    client.release();
  }

  let cached: WeightMap | null = null;

  return {
    async getWeights(): Promise<WeightMap> {
      if (cached) return cached;
      const c = await pool.connect();
      try {
        const { rows } = await c.queryArray<[number, number, number, number, number, number, number]>(
          "SELECT momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta FROM intelligence.signal_weights WHERE id = 1",
        );
        if (rows.length === 0) return { ...DEFAULT_WEIGHTS };
        const [momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta] = rows[0].map(Number) as [number,number,number,number,number,number,number];
        cached = { momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta };
        return cached;
      } finally {
        c.release();
      }
    },

    async saveWeights(weights: WeightMap): Promise<void> {
      const c = await pool.connect();
      try {
        await c.queryArray(
          `INSERT INTO intelligence.signal_weights
            (id, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             momentum = EXCLUDED.momentum,
             relative_volume = EXCLUDED.relative_volume,
             realised_vol = EXCLUDED.realised_vol,
             sector_rs = EXCLUDED.sector_rs,
             event_score = EXCLUDED.event_score,
             news_velocity = EXCLUDED.news_velocity,
             sentiment_delta = EXCLUDED.sentiment_delta,
             updated_at = EXCLUDED.updated_at`,
          [
            weights.momentum, weights.relativeVolume, weights.realisedVol,
            weights.sectorRelativeStrength, weights.eventScore,
            weights.newsVelocity, weights.sentimentDelta, Date.now(),
          ],
        );
        cached = null;
      } finally {
        c.release();
      }
    },
  };
}
