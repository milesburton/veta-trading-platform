import { chmod, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { runCommand } from "../lib/process.ts";

const SCRIPT = new URL("../../../scripts/postgres-backup.sh", import.meta.url).pathname;
const DAY_MS = 86_400_000;

const FAKE_PG_DUMP = `#!/bin/sh
[ "$FAKE_PG_DUMP_FAIL" = "1" ] && exit 1
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-f" ]; then out="$2"; fi
  shift
done
echo "PGDMP fake dump" > "$out"
`;

const FAKE_PG_RESTORE = `#!/bin/sh
[ "$FAKE_PG_RESTORE_FAIL" = "1" ] && exit 1
exit 0
`;

interface Sandbox {
  backups: string;
  bin: string;
  run: (env?: Record<string, string>) => Promise<{ code: number | null; stdout: string }>;
  cleanup: () => Promise<void>;
}

async function sandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "pg-backup-"));
  const bin = join(root, "bin");
  const backups = join(root, "backups");
  await Promise.all([
    writeFile(join(root, "placeholder"), ""),
    runCommand("bash", ["-c", `mkdir -p "${bin}" "${backups}"`]),
  ]);
  for (const [name, body] of [
    ["pg_dump", FAKE_PG_DUMP],
    ["pg_restore", FAKE_PG_RESTORE],
  ]) {
    await writeFile(join(bin, name), body);
    await chmod(join(bin, name), 0o755);
  }
  return {
    backups,
    bin,
    run: async (env = {}) => {
      const result = await runCommand("bash", [SCRIPT], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          BACKUP_DIR: backups,
          BACKUP_ONCE: "1",
          ...env,
        },
      });
      return { code: result.code, stdout: result.stdout };
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function dumps(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith(".dump")).sort();
}

async function metric(dir: string, name: string): Promise<number> {
  const text = await readFile(join(dir, "metrics", "metrics"), "utf8");
  const line = text.split("\n").find((l) => l.startsWith(`${name} `));
  return Number(line?.split(" ")[1]);
}

async function seedDump(dir: string, name: string, ageDays: number): Promise<void> {
  const file = join(dir, name);
  await writeFile(file, "old");
  const when = new Date(Date.now() - ageDays * DAY_MS);
  await utimes(file, when, when);
}

test("[postgres-backup] a successful run writes a verified dump and success metrics", async () => {
  const box = await sandbox();
  try {
    const result = await box.run();
    assertEquals(result.code, 0);
    const files = await dumps(box.backups);
    assertEquals(files.length, 1);
    assert((await readdir(box.backups)).every((f) => !f.endsWith(".partial")));
    assertEquals(await metric(box.backups, "veta_postgres_backup_last_status"), 1);
    assertEquals(await metric(box.backups, "veta_postgres_backup_files"), 1);
    assert((await metric(box.backups, "veta_postgres_backup_last_success_timestamp_seconds")) > 0);
    assert((await metric(box.backups, "veta_postgres_backup_last_size_bytes")) > 0);
  } finally {
    await box.cleanup();
  }
});

test("[postgres-backup] a failing pg_dump leaves no dump and reports failure", async () => {
  const box = await sandbox();
  try {
    const result = await box.run({ FAKE_PG_DUMP_FAIL: "1" });
    assertEquals(result.code, 1);
    assertEquals((await dumps(box.backups)).length, 0);
    assertEquals(await metric(box.backups, "veta_postgres_backup_last_status"), 0);
    assertEquals(
      await metric(box.backups, "veta_postgres_backup_last_success_timestamp_seconds"),
      0
    );
  } finally {
    await box.cleanup();
  }
});

test("[postgres-backup] a dump that fails verification is discarded", async () => {
  const box = await sandbox();
  try {
    const result = await box.run({ FAKE_PG_RESTORE_FAIL: "1" });
    assertEquals(result.code, 1);
    assertEquals(
      await readdir(box.backups).then((f) => f.filter((n) => n.startsWith("veta-"))),
      []
    );
    assertEquals(await metric(box.backups, "veta_postgres_backup_last_status"), 0);
  } finally {
    await box.cleanup();
  }
});

test("[postgres-backup] a failure after a success keeps the last success timestamp", async () => {
  const box = await sandbox();
  try {
    await box.run();
    const before = await metric(box.backups, "veta_postgres_backup_last_success_timestamp_seconds");
    await box.run({ FAKE_PG_DUMP_FAIL: "1" });
    assertEquals(await metric(box.backups, "veta_postgres_backup_last_status"), 0);
    assertEquals(
      await metric(box.backups, "veta_postgres_backup_last_success_timestamp_seconds"),
      before
    );
    assertEquals((await dumps(box.backups)).length, 1);
  } finally {
    await box.cleanup();
  }
});

test("[postgres-backup] retention prunes dumps older than the window but keeps the newest few", async () => {
  const box = await sandbox();
  try {
    for (let i = 0; i < 5; i++)
      await seedDump(box.backups, `veta-2020010${i}T000000Z.dump`, 30 + i);
    await box.run({ BACKUP_RETENTION_DAYS: "14", BACKUP_MIN_KEEP: "3" });
    assertEquals((await dumps(box.backups)).length, 3);
  } finally {
    await box.cleanup();
  }
});

test("[postgres-backup] recent dumps are never pruned", async () => {
  const box = await sandbox();
  try {
    for (let i = 0; i < 5; i++) await seedDump(box.backups, `veta-2026010${i}T000000Z.dump`, i + 1);
    await box.run({ BACKUP_RETENTION_DAYS: "14", BACKUP_MIN_KEEP: "3" });
    assertEquals((await dumps(box.backups)).length, 6);
  } finally {
    await box.cleanup();
  }
});
