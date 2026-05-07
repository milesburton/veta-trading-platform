import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { assert } from "jsr:@std/assert@0.217";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";
import { startEphemeralRedpanda } from "./testcontainers/redpanda.ts";

Deno.test({
  name: "testcontainers: ephemeral Postgres + migrations",
  ignore: Deno.env.get("RUN_TESTCONTAINERS") !== "1",
  async fn() {
    const pg = await startEphemeralPostgres();
    try {
      await applyMigrations(pg.url);

      const pool = new Pool(pg.url, 1, false);
      const client = await pool.connect();
      try {
        const res = await client.queryObject<{ count: bigint }>(
          "SELECT count(*)::bigint AS count FROM public.schema_migrations",
        );
        assert(Number(res.rows[0].count) >= 1, "expected at least one migration row");

        const tables = await client.queryArray<[string, string]>(
          `SELECT table_schema, table_name
             FROM information_schema.tables
            WHERE table_schema IN ('users','journal','scenarios','risk')
            ORDER BY table_schema, table_name`,
        );
        const found = new Set(tables.rows.map(([s, t]) => `${s}.${t}`));
        assert(found.has("users.users"), "users.users not migrated");
        assert(found.has("journal.events"), "journal.events not migrated");
        assert(found.has("scenarios.scenarios"), "scenarios.scenarios not migrated");
        assert(found.has("risk.config_versions"), "risk.config_versions not migrated");
      } finally {
        client.release();
        await pool.end();
      }
    } finally {
      await pg.teardown();
    }
  },
});

Deno.test({
  name: "testcontainers: ephemeral Redpanda boots and exposes a broker",
  ignore: Deno.env.get("RUN_TESTCONTAINERS") !== "1",
  async fn() {
    const rp = await startEphemeralRedpanda();
    try {
      assert(rp.brokers.includes(":"), "broker address should be host:port");
      assert(rp.host.length > 0, "host should be non-empty");
      assert(rp.port > 0, "host port should be > 0");
    } finally {
      await rp.teardown();
    }
  },
});
