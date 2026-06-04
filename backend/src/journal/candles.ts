import { journalPool } from "@veta/db";
import { logger } from "@veta/logger";

const TICKS_PER_MINUTE = 240;
export const MAX_CANDLES = 120;

const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

let lastPruneTs = 0;

async function maybePruneCandles(now: number): Promise<void> {
  if (now - lastPruneTs < 60_000) return;
  lastPruneTs = now;
  const client = await journalPool.connect();
  try {
    for (const { key } of INTERVALS) {
      await client.queryArray(
        `DELETE FROM journal.candles
         WHERE (interval, instrument, time) IN (
           SELECT interval, instrument, time FROM (
             SELECT interval, instrument, time,
                    ROW_NUMBER() OVER (PARTITION BY instrument ORDER BY time DESC) AS rn
             FROM journal.candles WHERE interval = $1
           ) ranked WHERE rn > $2
         )`,
        [key, MAX_CANDLES]
      );
    }
  } finally {
    client.release();
  }
}

export async function ingestTick(msg: {
  prices?: Record<string, number>;
  volumes?: Record<string, number>;
}): Promise<void> {
  if (!msg.prices) return;
  const ts = Date.now();
  const volumes = msg.volumes ?? {};
  const entries = Object.entries(msg.prices);
  if (entries.length === 0) return;

  const instruments = entries.map(([sym]) => sym);
  const prices = entries.map(([, p]) => p);
  const vols = entries.map(([sym]) => (volumes[sym] ?? 0) / TICKS_PER_MINUTE);

  const client = await journalPool.connect();
  try {
    await client.queryArray("BEGIN");
    for (const { key, ms } of INTERVALS) {
      const bucket = new Date(bucketStart(ts, ms));
      await client.queryArray(
        `INSERT INTO journal.candles (instrument, interval, time, open, high, low, close, volume)
         SELECT unnest($1::text[]), $2, $3,
                unnest($4::numeric[]), unnest($4::numeric[]),
                unnest($4::numeric[]), unnest($4::numeric[]),
                unnest($5::numeric[])
         ON CONFLICT (instrument, interval, time) DO UPDATE SET
           high   = GREATEST(journal.candles.high,  EXCLUDED.high),
           low    = LEAST(journal.candles.low,    EXCLUDED.low),
           close  = EXCLUDED.close,
           volume = journal.candles.volume + EXCLUDED.volume`,
        [instruments, key, bucket, prices, vols]
      );
    }
    await client.queryArray("COMMIT");
  } catch (err) {
    await client.queryArray("ROLLBACK").catch(() => {});
    logger.warn("candle upsert failed", { err: err as Error });
  } finally {
    client.release();
  }
  maybePruneCandles(ts).catch(() => {});
}
