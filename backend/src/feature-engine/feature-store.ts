import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import type { FeatureVector } from "../types/intelligence.ts";

const MAX_PER_SYMBOL = 500;

export class FeatureStore {
  private db: DB;

  constructor(dbPath: string) {
    const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
    if (dir) Deno.mkdirSync(dir, { recursive: true });
    this.db = new DB(dbPath);
    this.db.query("PRAGMA journal_mode=WAL");
    this.db.query("PRAGMA synchronous=NORMAL");
    this.db.query("PRAGMA cache_size=-8000");
    this.db.query("PRAGMA busy_timeout=3000");
    this.db.query(`
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
    this.db.query("CREATE INDEX IF NOT EXISTS idx_fv_symbol_ts ON feature_vectors(symbol, ts DESC)");
  }

  insert(fv: FeatureVector): void {
    this.db.query(
      `INSERT INTO feature_vectors
        (symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [fv.symbol, fv.ts, fv.momentum, fv.relativeVolume, fv.realisedVol,
        fv.sectorRelativeStrength, fv.eventScore, fv.newsVelocity, fv.sentimentDelta],
    );

    this.db.query(
      `DELETE FROM feature_vectors
       WHERE symbol = ? AND id NOT IN (
         SELECT id FROM feature_vectors WHERE symbol = ? ORDER BY ts DESC LIMIT ?
       )`,
      [fv.symbol, fv.symbol, MAX_PER_SYMBOL],
    );
  }

  getLatest(symbol: string): FeatureVector | null {
    const rows = [
      ...this.db.query(
        `SELECT symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta
         FROM feature_vectors WHERE symbol = ? ORDER BY ts DESC LIMIT 1`,
        [symbol],
      ),
    ];
    if (rows.length === 0) return null;
    return this.rowToFv(rows[0]);
  }

  getHistory(symbol: string, limit: number): FeatureVector[] {
    const rows = [
      ...this.db.query(
        `SELECT symbol, ts, momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta
         FROM feature_vectors WHERE symbol = ? ORDER BY ts DESC LIMIT ?`,
        [symbol, limit],
      ),
    ];
    return rows.map((r) => this.rowToFv(r));
  }

  private rowToFv(r: unknown[]): FeatureVector {
    const [symbol, ts, momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta] = r as [string, number, number, number, number, number, number, number, number];
    return { symbol, ts, momentum, relativeVolume, realisedVol, sectorRelativeStrength, eventScore, newsVelocity, sentimentDelta };
  }

  close(): void {
    this.db.close();
  }
}
