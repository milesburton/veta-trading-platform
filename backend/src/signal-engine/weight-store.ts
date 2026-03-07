import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
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

export class WeightStore {
  private db: DB;
  private cached: WeightMap | null = null;

  constructor(dbPath: string) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) Deno.mkdirSync(dir, { recursive: true });
    this.db = new DB(dbPath);
    this.db.query("PRAGMA journal_mode=WAL");
    this.db.query("PRAGMA synchronous=NORMAL");
    this.db.query(`
      CREATE TABLE IF NOT EXISTS signal_weights (
        id                    INTEGER PRIMARY KEY CHECK(id = 1),
        momentum              REAL NOT NULL,
        relative_volume       REAL NOT NULL,
        realised_vol          REAL NOT NULL,
        sector_rs             REAL NOT NULL,
        event_score           REAL NOT NULL,
        news_velocity         REAL NOT NULL,
        sentiment_delta       REAL NOT NULL,
        updated_at            INTEGER NOT NULL
      )
    `);
    const count = [...this.db.query("SELECT COUNT(*) FROM signal_weights")][0][0] as number;
    if (count === 0) this.saveWeights(DEFAULT_WEIGHTS);
  }

  getWeights(): WeightMap {
    if (this.cached) return this.cached;
    const rows = [...this.db.query(
      "SELECT momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta FROM signal_weights WHERE id = 1",
    )];
    if (rows.length === 0) return { ...DEFAULT_WEIGHTS };
    const [momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta] = rows[0] as number[];
    this.cached = { momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta };
    return this.cached;
  }

  saveWeights(weights: WeightMap): void {
    this.db.query(
      `INSERT OR REPLACE INTO signal_weights
        (id, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        weights.momentum, weights.relativeVolume, weights.realisedVol,
        weights.sectorRelativeStrength, weights.eventScore, weights.newsVelocity,
        weights.sentimentDelta, Date.now(),
      ],
    );
    this.cached = null;
  }

  close(): void {
    this.db.close();
  }
}
