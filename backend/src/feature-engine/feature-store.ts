import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import type { FeatureVector } from "../types/intelligence.ts";

const MAX_PER_SYMBOL = 500;

export interface FeatureStore {
  insert(fv: FeatureVector): void;
  getLatest(symbol: string): FeatureVector | null;
  getHistory(symbol: string, limit: number): FeatureVector[];
  close(): void;
}

function rowToFv(r: unknown[]): FeatureVector {
  const [symbol, ts, momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta] =
    r as [string, number, number, number, number, number, number, number, number];
  return { symbol, ts, momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta };
}

export function createFeatureStore(dbPath: string): FeatureStore {
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) Deno.mkdirSync(dir, { recursive: true });

  const db = new DB(dbPath);
  db.query("PRAGMA journal_mode=WAL");
  db.query("PRAGMA synchronous=NORMAL");
  db.query("PRAGMA cache_size=-8000");
  db.query("PRAGMA busy_timeout=3000");
  db.query(`
    CREATE TABLE IF NOT EXISTS feature_vectors (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol         TEXT NOT NULL,
      ts             INTEGER NOT NULL,
      momentum       REAL NOT NULL DEFAULT 0,
      relative_volume REAL NOT NULL DEFAULT 0,
      realised_vol   REAL NOT NULL DEFAULT 0,
      sector_rs      REAL NOT NULL DEFAULT 0,
      event_score    REAL NOT NULL DEFAULT 0,
      news_velocity  REAL NOT NULL DEFAULT 0,
      sentiment_delta REAL NOT NULL DEFAULT 0
    )
  `);
  db.query("CREATE INDEX IF NOT EXISTS idx_fv_symbol_ts ON feature_vectors(symbol, ts DESC)");

  return {
    insert(fv: FeatureVector): void {
      db.query(
        `INSERT INTO feature_vectors
          (symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [fv.symbol, fv.ts, fv.momentum, fv.relativeVolume, fv.realisedVol,
          fv.sectorRelativeStrength, fv.eventScore, fv.newsVelocity, fv.sentimentDelta],
      );
      db.query(
        `DELETE FROM feature_vectors
         WHERE symbol = ? AND id NOT IN (
           SELECT id FROM feature_vectors WHERE symbol = ? ORDER BY ts DESC LIMIT ?
         )`,
        [fv.symbol, fv.symbol, MAX_PER_SYMBOL],
      );
    },

    getLatest(symbol: string): FeatureVector | null {
      const rows = [
        ...db.query(
          `SELECT symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta
           FROM feature_vectors WHERE symbol = ? ORDER BY ts DESC LIMIT 1`,
          [symbol],
        ),
      ];
      return rows.length === 0 ? null : rowToFv(rows[0]);
    },

    getHistory(symbol: string, limit: number): FeatureVector[] {
      const rows = [
        ...db.query(
          `SELECT symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta
           FROM feature_vectors WHERE symbol = ? ORDER BY ts DESC LIMIT ?`,
          [symbol, limit],
        ),
      ];
      return rows.map(rowToFv);
    },

    close(): void {
      db.close();
    },
  };
}
