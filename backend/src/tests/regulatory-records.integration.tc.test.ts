import { Pool } from "#veta/db";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  appendRegulatoryEvent,
  firstBrokenRegulatorySeq,
  regulatoryEventsBetween,
  regulatoryHead,
} from "../lib/regulatory-records.ts";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";

const event = (n: number) => ({
  eventId: `orders.child:c${n}`,
  eventType: "orders.child",
  ts: 1_700_000_000_000 + n * 1000,
  orderId: "o1",
  childId: `c${n}`,
  payload: { quantity: n },
});

async function withDb(run: (pool: Pool) => Promise<void>): Promise<void> {
  const pg = await startEphemeralPostgres();
  const pool = new Pool(pg.url, 4, false);
  try {
    await applyMigrations(pg.url);
    await run(pool);
  } finally {
    await pool.end();
    await pg.teardown();
  }
}

async function failure(pool: Pool, sql: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.queryArray(sql);
    return "";
  } catch (err) {
    return (err as Error).message;
  } finally {
    client.release();
  }
}

test({
  name: "regulatory: order events form a verifiable chain and duplicates are ignored",
  ignore: !SHOULD_RUN,
  async fn() {
    await withDb(async (pool) => {
      assertEquals(await firstBrokenRegulatorySeq(pool), null);
      await appendRegulatoryEvent(pool, event(1));
      await appendRegulatoryEvent(pool, event(2));
      await appendRegulatoryEvent(pool, event(2));
      const records = await regulatoryEventsBetween(pool, 0, Date.now());
      assertEquals(
        records.map((r) => r.seq),
        [1, 2]
      );
      assertEquals(records[1].prevHash, records[0].hash);
      assertEquals((await regulatoryHead(pool))?.seq, 2);
      assertEquals(await firstBrokenRegulatorySeq(pool), null);
    });
  },
});

test({
  name: "regulatory: update, delete and truncate are rejected",
  ignore: !SHOULD_RUN,
  async fn() {
    await withDb(async (pool) => {
      await appendRegulatoryEvent(pool, event(1));
      for (const sql of [
        "UPDATE regulatory.order_events SET payload = '{}'::jsonb",
        "DELETE FROM regulatory.order_events",
        "TRUNCATE regulatory.order_events",
      ]) {
        assert((await failure(pool, sql)).includes("append-only"), sql);
      }
      assertEquals(await firstBrokenRegulatorySeq(pool), null);
    });
  },
});
