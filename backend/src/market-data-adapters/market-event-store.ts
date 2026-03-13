import type { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import type { MarketAdapterEvent } from "../types/intelligence.ts";

export interface MarketEventStore {
  upsertEvent(ev: MarketAdapterEvent, source: string): Promise<void>;
  getEvents(from: number, to: number, ticker?: string): Promise<MarketAdapterEvent[]>;
}

function rowToEvent(r: unknown[]): MarketAdapterEvent {
  const [id, type, ticker, headline, scheduled_at, impact, , fetched_at] =
    r as [string, string, string | null, string, bigint | number, string, string, bigint | number];
  return {
    id,
    type: type as MarketAdapterEvent["type"],
    ticker: ticker ?? undefined,
    headline,
    scheduledAt: Number(scheduled_at),
    impact: impact as MarketAdapterEvent["impact"],
    ts: Number(fetched_at),
  };
}

export function createMarketEventStore(pool: Pool): MarketEventStore {
  return {
    async upsertEvent(ev: MarketAdapterEvent, source: string): Promise<void> {
      const client = await pool.connect();
      try {
        await client.queryArray(
          `INSERT INTO intelligence.market_events
             (id, type, ticker, headline, scheduled_at, impact, source, fetched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO UPDATE SET
             headline     = EXCLUDED.headline,
             scheduled_at = EXCLUDED.scheduled_at,
             impact       = EXCLUDED.impact,
             source       = EXCLUDED.source,
             fetched_at   = EXCLUDED.fetched_at`,
          [ev.id, ev.type, ev.ticker ?? null, ev.headline, ev.scheduledAt, ev.impact, source, ev.ts],
        );
      } finally {
        client.release();
      }
    },

    async getEvents(from: number, to: number, ticker?: string): Promise<MarketAdapterEvent[]> {
      const client = await pool.connect();
      try {
        let query: string;
        let params: unknown[];
        if (ticker) {
          query = `SELECT id, type, ticker, headline, scheduled_at, impact, source, fetched_at
                   FROM intelligence.market_events
                   WHERE scheduled_at >= $1 AND scheduled_at <= $2
                     AND (ticker = $3 OR ticker IS NULL)
                   ORDER BY scheduled_at`;
          params = [from, to, ticker];
        } else {
          query = `SELECT id, type, ticker, headline, scheduled_at, impact, source, fetched_at
                   FROM intelligence.market_events
                   WHERE scheduled_at >= $1 AND scheduled_at <= $2
                   ORDER BY scheduled_at`;
          params = [from, to];
        }
        const { rows } = await client.queryArray(query, params);
        return rows.map(rowToEvent);
      } finally {
        client.release();
      }
    },
  };
}
