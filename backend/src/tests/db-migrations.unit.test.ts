import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assertEquals, assertRejects } from "#veta/test-assert";

const h = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; params?: unknown[] }>,
  applied: [] as string[],
  roleExists: false,
  failOn: undefined as string | undefined,
  ended: 0,
  released: 0,
  urls: [] as string[],
}));

vi.mock("#veta/db", () => ({
  Pool: class {
    constructor(url: string) {
      h.urls.push(url);
    }
    connect() {
      return Promise.resolve({
        queryArray: (sql: string, params?: unknown[]) => {
          h.queries.push({ sql, params });
          if (h.failOn && sql.includes(h.failOn)) return Promise.reject(new Error("sql failed"));
          if (sql.includes("SELECT version"))
            return Promise.resolve({ rows: h.applied.map((v) => [v]) });
          if (sql.includes("pg_roles")) return Promise.resolve({ rows: h.roleExists ? [[1]] : [] });
          if (sql.includes("format(")) return Promise.resolve({ rows: [["ROLE STATEMENT"]] });
          return Promise.resolve({ rows: [] });
        },
        release: () => {
          h.released += 1;
        },
      });
    }
    end() {
      h.ended += 1;
      return Promise.resolve();
    }
  },
}));

const { runMigrations } = await import("../../db/runMigrations.ts");
const { provisionAuditLogin } = await import("../../db/auditRole.ts");

async function migrationsDir(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "veta-migrations-"));
  for (const [name, sql] of Object.entries(files)) await writeFile(join(dir, name), sql);
  return dir;
}

beforeEach(() => {
  h.queries.length = 0;
  h.applied.length = 0;
  h.roleExists = false;
  h.failOn = undefined;
  h.ended = 0;
  h.released = 0;
  h.urls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

test("[migrations] applies pending files in order and skips recorded ones", async () => {
  h.applied.push("0001_a");
  const dir = await migrationsDir({
    "0002_b.sql": "SELECT 2",
    "0001_a.sql": "SELECT 1",
    "0003_c.sql": "SELECT 3",
    "notes.txt": "ignored",
  });
  const result = await runMigrations("postgres://db", { migrationsDir: dir, quiet: true });
  assertEquals(result, { applied: ["0002_b", "0003_c"], skipped: ["0001_a"] });
  assertEquals(h.urls, ["postgres://db"]);
  const recorded = h.queries.filter((q) =>
    q.sql.startsWith("INSERT INTO public.schema_migrations")
  );
  assertEquals(
    recorded.map((q) => q.params),
    [["0002_b"], ["0003_c"]]
  );
  assertEquals([h.released, h.ended], [1, 1]);
});

test("[migrations] logs each step unless quiet", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dir = await migrationsDir({ "0001_a.sql": "SELECT 1" });
  await runMigrations("postgres://db", { migrationsDir: dir });
  assertEquals(
    log.mock.calls.map((c) => c[0]),
    ["  [apply] 0001_a", "  [done] 0001_a"]
  );
  h.applied.push("0001_a");
  log.mockClear();
  await runMigrations("postgres://db", { migrationsDir: dir });
  assertEquals(log.mock.calls[0][0], "  [skip] 0001_a");
});

test("[migrations] releases the connection and pool when a migration fails", async () => {
  const dir = await migrationsDir({ "0001_a.sql": "BOOM" });
  h.failOn = "BOOM";
  await assertRejects(
    () => runMigrations("postgres://db", { migrationsDir: dir, quiet: true }),
    Error,
    "sql failed"
  );
  assertEquals([h.released, h.ended], [1, 1]);
});

test("[migrations] defaults to the bundled migrations directory", async () => {
  h.applied.push(
    ...(
      await (
        await import("node:fs/promises")
      ).readdir(join(import.meta.dirname, "../../db/migrations"))
    )
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(".sql", ""))
  );
  const result = await runMigrations("postgres://db", { quiet: true });
  assertEquals(result.applied, []);
  assertEquals(result.skipped.length > 0, true);
});

test("[audit-role] creates the login role when it does not exist", async () => {
  await provisionAuditLogin("postgres://db", "pw");
  const format = h.queries.find((q) => q.sql.includes("format("));
  assertEquals(format?.params, ["CREATE", "veta_audit", "pw"]);
  assertEquals(h.queries.at(-1)?.sql, "GRANT audit_writer TO veta_audit");
  assertEquals([h.released, h.ended], [1, 1]);
});

test("[audit-role] alters the login role when it already exists", async () => {
  h.roleExists = true;
  await provisionAuditLogin("postgres://db", "pw");
  assertEquals(h.queries.find((q) => q.sql.includes("format("))?.params?.[0], "ALTER");
});

test("[audit-role] cleans up when provisioning fails", async () => {
  h.failOn = "GRANT";
  await assertRejects(() => provisionAuditLogin("postgres://db", "pw"), Error, "sql failed");
  assertEquals([h.released, h.ended], [1, 1]);
});

async function runMigrateScript(env: Record<string, string | undefined>) {
  vi.resetModules();
  const run = vi.fn().mockResolvedValue({ applied: ["a"], skipped: [] });
  const provision = vi.fn().mockResolvedValue(undefined);
  vi.doMock("../../db/runMigrations.ts", () => ({ runMigrations: run }));
  vi.doMock("../../db/auditRole.ts", () => ({ provisionAuditLogin: provision }));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("../../db/migrate.ts");
  vi.unstubAllEnvs();
  return { run, provision, exit, warn, error };
}

test("[migrate] exits when DATABASE_URL is missing", async () => {
  const { exit, error } = await runMigrateScript({ DATABASE_URL: "" });
  assertEquals(exit.mock.calls[0], [1]);
  assertEquals(error.mock.calls[0][0], "DATABASE_URL is required");
});

test("[migrate] provisions the audit login when a password is configured", async () => {
  const { run, provision } = await runMigrateScript({
    DATABASE_URL: "postgres://db",
    AUDIT_DB_PASSWORD: "pw",
  });
  assertEquals(run.mock.calls[0], ["postgres://db"]);
  assertEquals(provision.mock.calls[0], ["postgres://db", "pw"]);
});

test("[migrate] warns when no audit password is configured", async () => {
  const { provision, warn } = await runMigrateScript({
    DATABASE_URL: "postgres://db",
    AUDIT_DB_PASSWORD: "",
  });
  assertEquals(provision.mock.calls.length, 0);
  assertEquals(String(warn.mock.calls[0][0]).includes("AUDIT_DB_PASSWORD is not set"), true);
});

test("[migrate] exits non-zero when a migration fails", async () => {
  vi.resetModules();
  vi.doMock("../../db/runMigrations.ts", () => ({
    runMigrations: vi.fn().mockRejectedValue(new Error("nope")),
  }));
  vi.doMock("../../db/auditRole.ts", () => ({ provisionAuditLogin: vi.fn() }));
  vi.stubEnv("DATABASE_URL", "postgres://db");
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await import("../../db/migrate.ts");
  vi.unstubAllEnvs();
  assertEquals(exit.mock.calls[0], [1]);
});

test("[migration-safety] reports clean files and flags destructive ones", async () => {
  const { main } = await import("../../db/checkMigrationsSafe.ts");
  const dir = await migrationsDir({
    "0001_ok.sql": "ALTER TABLE t ADD COLUMN c int;",
    "0002_bad.sql": "DROP TABLE t;",
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

  await main([join(dir, "0001_ok.sql"), join(dir, "missing.sql")]);
  assertEquals(String(log.mock.calls[0][0]).includes("2 file(s) clean"), true);
  assertEquals(exit.mock.calls.length, 0);

  await main([join(dir, "0002_bad.sql")]);
  assertEquals(exit.mock.calls[0], [1]);
  assertEquals(
    error.mock.calls.some((c) => String(c[0]).includes("[drop-table]")),
    true
  );
});

test("[migration-safety] scans the bundled migrations when no files are given", async () => {
  const { main } = await import("../../db/checkMigrationsSafe.ts");
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  await main([]);
  assertEquals(exit.mock.calls.length, 0);
  assertEquals(String(log.mock.calls[0][0]).includes("clean (expand/contract)"), true);
});
