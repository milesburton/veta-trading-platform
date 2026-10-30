import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "#veta/db";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { runCommand } from "../lib/process.ts";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";
const BACKUP_SCRIPT = new URL("../../../scripts/postgres-backup.sh", import.meta.url).pathname;
const DUMP_DIR = "/tmp/backups";

async function docker(...args: string[]): Promise<string> {
  const result = await runCommand("docker", args);
  if (result.code !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${result.stderr.slice(0, 400)}`);
  }
  return result.stdout.trim();
}

async function tableCounts(pool: Pool): Promise<Record<string, number>> {
  const client = await pool.connect();
  try {
    const { rows: tables } = await client.queryObject<{ schemaname: string; tablename: string }>(
      `SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename`
    );
    const entries: Array<readonly [string, number]> = [];
    for (const { schemaname, tablename } of tables) {
      const { rows } = await client.queryObject<{ n: bigint }>(
        `SELECT count(*) AS n FROM "${schemaname}"."${tablename}"`
      );
      entries.push([`${schemaname}.${tablename}`, Number(rows[0].n)]);
    }
    return Object.fromEntries(entries);
  } finally {
    client.release();
  }
}

async function insertRiskConfigs(pool: Pool, count: number): Promise<void> {
  const client = await pool.connect();
  try {
    for (let i = 0; i < count; i++) {
      await client.queryArray(
        "INSERT INTO risk.config_versions (created_by, reason, config) VALUES ($1, $2, $3::jsonb)",
        ["drill", `version ${i}`, JSON.stringify({ maxOrderQty: 100 + i })]
      );
    }
  } finally {
    client.release();
  }
}

test({
  name: "restore drill: a backup taken with the production script restores into a fresh database",
  ignore: !SHOULD_RUN,
  async fn() {
    const source = await startEphemeralPostgres();
    const target = await startEphemeralPostgres();
    const workdir = await mkdtemp(join(tmpdir(), "restore-drill-"));
    const sourcePool = new Pool(source.url, 2, false);
    const targetPool = new Pool(target.url, 2, false);
    try {
      await applyMigrations(source.url);
      await insertRiskConfigs(sourcePool, 12);
      const expected = await tableCounts(sourcePool);
      assertEquals(expected["risk.config_versions"], 12);
      assert(expected["public.schema_migrations"] > 0);

      await docker("cp", BACKUP_SCRIPT, `${source.containerId}:/tmp/postgres-backup.sh`);
      await docker(
        "exec",
        "-e",
        "BACKUP_ONCE=1",
        "-e",
        `BACKUP_DIR=${DUMP_DIR}`,
        "-e",
        `PGUSER=${source.user}`,
        "-e",
        `PGPASSWORD=${source.password}`,
        "-e",
        `PGDATABASE=${source.database}`,
        source.containerId,
        "sh",
        "/tmp/postgres-backup.sh"
      );
      const dumpName = await docker(
        "exec",
        source.containerId,
        "sh",
        "-c",
        `ls ${DUMP_DIR} | grep '^veta-.*\\.dump$' | head -1`
      );
      assert(dumpName.length > 0, "backup script produced no dump");

      const hostDump = join(workdir, dumpName);
      await docker("cp", `${source.containerId}:${DUMP_DIR}/${dumpName}`, hostDump);
      await docker("cp", hostDump, `${target.containerId}:/tmp/${dumpName}`);
      await docker(
        "exec",
        "-e",
        `PGPASSWORD=${target.password}`,
        target.containerId,
        "pg_restore",
        "-U",
        target.user,
        "-d",
        target.database,
        "--no-owner",
        `/tmp/${dumpName}`
      );

      assertEquals(await tableCounts(targetPool), expected);
    } finally {
      await Promise.all([sourcePool.end(), targetPool.end()]);
      await Promise.all([source.teardown(), target.teardown()]);
      await rm(workdir, { recursive: true, force: true });
    }
  },
});
