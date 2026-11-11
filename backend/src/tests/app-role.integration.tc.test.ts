import { Pool } from "#veta/db";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { APP_LOGIN_ROLE, provisionAppLogin } from "../../db/appRole.ts";
import { appendAudit, listAudit } from "../lib/audit.ts";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";

const EVENT = {
  actorId: "admin-1",
  actorRole: "admin",
  action: "orders_kill",
  target: "user:u-9",
};

const APP_OBJECTS = `
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT LIKE 'pg\\_%'
    AND n.nspname NOT IN ('information_schema', 'public', 'audit', 'regulatory')`;

function loginUrl(adminUrl: string, password: string): string {
  const url = new URL(adminUrl);
  url.username = APP_LOGIN_ROLE;
  url.password = password;
  return url.toString();
}

async function run(pool: Pool, sql: string): Promise<unknown[][]> {
  const client = await pool.connect();
  try {
    return (await client.queryArray(sql)).rows;
  } finally {
    client.release();
  }
}

async function rejects(pool: Pool, sql: string): Promise<string> {
  try {
    await run(pool, sql);
    return "";
  } catch (err) {
    return (err as Error).message;
  }
}

async function withAppRole(body: (admin: Pool, app: Pool) => Promise<void>): Promise<void> {
  const pg = await startEphemeralPostgres();
  const admin = new Pool(pg.url, 2, false);
  try {
    await applyMigrations(pg.url);
    await provisionAppLogin(pg.url, "it's a p@ss:word/with?chars");
    await provisionAppLogin(pg.url, "rotated");
    const app = new Pool(loginUrl(pg.url, "rotated"), 2, false);
    try {
      await body(admin, app);
    } finally {
      await app.end();
    }
  } finally {
    await admin.end();
    await pg.teardown();
  }
}

test({
  name: "app-role: the application login holds no elevated role attributes",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAppRole(async (admin) => {
      const rows = await run(
        admin,
        `SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
           FROM pg_roles WHERE rolname = '${APP_LOGIN_ROLE}'`
      );
      assertEquals(rows, [[false, false, false, false, false]]);
    });
  },
});

test({
  name: "app-role: every application table and sequence is usable by the application login",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAppRole(async (admin, app) => {
      const tables = await run(admin, `SELECT count(*)::int ${APP_OBJECTS} AND c.relkind = 'r'`);
      assert((tables[0][0] as number) > 20, "expected the application tables to exist");

      const missingTables = await run(
        admin,
        `SELECT n.nspname || '.' || c.relname ${APP_OBJECTS}
           AND c.relkind IN ('r', 'p')
           AND NOT (
             has_table_privilege('${APP_LOGIN_ROLE}', c.oid, 'SELECT')
             AND has_table_privilege('${APP_LOGIN_ROLE}', c.oid, 'INSERT')
             AND has_table_privilege('${APP_LOGIN_ROLE}', c.oid, 'UPDATE')
             AND has_table_privilege('${APP_LOGIN_ROLE}', c.oid, 'DELETE')
           )`
      );
      assertEquals(missingTables, []);

      const missingSequences = await run(
        admin,
        `SELECT n.nspname || '.' || c.relname ${APP_OBJECTS}
           AND c.relkind = 'S'
           AND NOT COALESCE(
             CASE WHEN c.relkind = 'S'
               THEN has_sequence_privilege('${APP_LOGIN_ROLE}', c.oid, 'USAGE')
             END,
             false
           )`
      );
      assertEquals(missingSequences, []);

      await run(admin, "CREATE TABLE journal.privilege_probe (id SERIAL PRIMARY KEY, note TEXT)");
      await run(app, "INSERT INTO journal.privilege_probe (note) VALUES ('a')");
      await run(app, "UPDATE journal.privilege_probe SET note = 'b'");
      assertEquals(await run(app, "SELECT note FROM journal.privilege_probe"), [["b"]]);
      await run(app, "DELETE FROM journal.privilege_probe WHERE note = 'b'");
      assertEquals(await run(app, "SELECT count(*)::int FROM journal.privilege_probe"), [[0]]);
    });
  },
});

test({
  name: "app-role: the application login can append to the audit log but cannot tamper with it",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAppRole(async (admin, app) => {
      await appendAudit(app, EVENT);
      await appendAudit(app, { ...EVENT, action: "orders_resume" });
      assertEquals(
        (await listAudit(app)).map((r) => r.seq),
        [2, 1]
      );

      for (const sql of [
        "UPDATE audit.events SET action = 'x'",
        "DELETE FROM audit.events",
        "TRUNCATE audit.events",
        "ALTER TABLE audit.events DISABLE TRIGGER events_no_update",
        "ALTER TABLE audit.events DISABLE TRIGGER ALL",
        "DROP TRIGGER events_no_update ON audit.events",
        "SET session_replication_role = replica",
        "DROP TABLE audit.events",
        "CREATE TABLE audit.shadow (id int)",
        "CREATE OR REPLACE FUNCTION audit.reject_mutation() RETURNS trigger AS 'BEGIN RETURN NEW; END;' LANGUAGE plpgsql",
        "SELECT count(*) FROM regulatory.order_events",
        "INSERT INTO regulatory.order_events (event_id) VALUES ('x')",
      ]) {
        assert((await rejects(app, sql)) !== "", `expected rejection: ${sql}`);
      }
      assertEquals((await listAudit(admin)).length, 2);
    });
  },
});

test({
  name: "app-role: the application login cannot change schema, roles or migration state",
  ignore: !SHOULD_RUN,
  async fn() {
    await withAppRole(async (_admin, app) => {
      for (const sql of [
        "ALTER TABLE journal.events ADD COLUMN injected int",
        "DROP TABLE journal.events",
        "TRUNCATE journal.events",
        "CREATE TABLE journal.shadow (id int)",
        "CREATE SCHEMA shadow",
        "CREATE ROLE intruder LOGIN",
        `ALTER ROLE ${APP_LOGIN_ROLE} SUPERUSER`,
        "SELECT count(*) FROM public.schema_migrations",
        "INSERT INTO public.schema_migrations (version) VALUES ('9999_fake')",
      ]) {
        assert((await rejects(app, sql)) !== "", `expected rejection: ${sql}`);
      }
    });
  },
});
