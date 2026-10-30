import { Pool } from "#veta/db";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { appendAudit, firstBrokenSeq, listAudit } from "../lib/audit.ts";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";

const EVENT = { actorId: "admin-1", actorRole: "admin", action: "orders_kill", target: "user:u-9" };

async function withAuditDb(run: (pool: Pool) => Promise<void>): Promise<void> {
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

async function rejects(pool: Pool, sql: string): Promise<string> {
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
  name: "audit: appended events form a verifiable hash chain",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAuditDb(async (pool) => {
      assertEquals(await firstBrokenSeq(pool), null);
      await appendAudit(pool, { ...EVENT, detail: { cancelled: 4 } });
      await appendAudit(pool, { ...EVENT, action: "orders_resume" });
      await appendAudit(pool, { ...EVENT, action: "market_hours_update", detail: { open: true } });

      const records = await listAudit(pool);
      assertEquals(
        records.map((r) => r.seq),
        [3, 2, 1]
      );
      assertEquals(records[2].detail, { cancelled: 4 });
      assert(records.every((r) => r.hash.length === 64));
      assertEquals(await firstBrokenSeq(pool), null);
    });
  },
});

test({
  name: "audit: concurrent appends keep a gapless chain",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAuditDb(async (pool) => {
      await Promise.all(
        Array.from({ length: 25 }, (_, i) => appendAudit(pool, { ...EVENT, detail: { i } }))
      );
      const records = await listAudit(pool, { limit: 100 });
      assertEquals(records.length, 25);
      assertEquals(
        records.map((r) => r.seq).sort((a, b) => a - b),
        Array.from({ length: 25 }, (_, i) => i + 1)
      );
      assertEquals(await firstBrokenSeq(pool), null);
    });
  },
});

test({
  name: "audit: update, delete and truncate are rejected",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAuditDb(async (pool) => {
      await appendAudit(pool, EVENT);
      for (const sql of [
        "UPDATE audit.events SET action = 'tampered'",
        "DELETE FROM audit.events WHERE seq = 1",
        "TRUNCATE audit.events",
      ]) {
        assert((await rejects(pool, sql)).includes("append-only"), sql);
      }
      assertEquals((await listAudit(pool)).length, 1);
    });
  },
});

test({
  name: "audit: tampering with a stored row is detected at that sequence",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAuditDb(async (pool) => {
      await appendAudit(pool, EVENT);
      await appendAudit(pool, { ...EVENT, action: "orders_resume" });
      await appendAudit(pool, { ...EVENT, action: "market_hours_update" });

      const client = await pool.connect();
      try {
        await client.queryArray("ALTER TABLE audit.events DISABLE TRIGGER events_no_update");
        await client.queryArray("UPDATE audit.events SET actor_id = 'someone-else' WHERE seq = 2");
        await client.queryArray("ALTER TABLE audit.events ENABLE TRIGGER events_no_update");
      } finally {
        client.release();
      }
      assertEquals(await firstBrokenSeq(pool), 2);
    });
  },
});
