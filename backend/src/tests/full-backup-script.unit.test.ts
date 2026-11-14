import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { runCommand } from "../lib/process.ts";

const SCRIPT = new URL("../../../scripts/full-backup.sh", import.meta.url).pathname;

const FAKE_DOCKER = `#!/bin/bash
echo "$*" >>"$FAKE_LOG"
case "$1" in
  exec)
    case "$*" in
      *pg_restore*) [ "$FAKE_RESTORE_FAIL" = "1" ] && exit 1; cat >/dev/null ;;
      *pg_dumpall*) echo "CREATE ROLE audit_writer NOLOGIN;" ;;
      *pg_dump*) [ "$FAKE_DUMP_EMPTY" = "1" ] || echo "PGDMP fake" ;;
      *"bao status"*) exit 0 ;;
    esac ;;
  volume) [ "$3" = "missing-volume" ] && exit 1; exit 0 ;;
  run) printf 'x' >"$FAKE_TMP/payload"; tar czf - -C "$FAKE_TMP" payload ;;
  ps) echo "veta-gateway-1 gateway:latest" ;;
  stop|start) exit 0 ;;
esac
`;

const FAKE_AGE = `#!/bin/bash
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -R) shift ;;
    *) in="$1" ;;
  esac
  shift
done
echo "AGE-ENCRYPTED" >"$out"
cat "$in" >>"$out"
`;

interface Sandbox {
  backups: string;
  log: () => Promise<string>;
  run: (env?: Record<string, string>) => Promise<{ code: number | null; stdout: string }>;
  cleanup: () => Promise<void>;
}

async function sandbox(withRecipient = true): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "full-backup-"));
  const bin = join(root, "bin");
  const stack = join(root, "stack");
  const backups = join(root, "backups");
  const tmp = join(root, "tmp");
  await Promise.all([
    mkdir(bin, { recursive: true }),
    mkdir(join(stack, "secrets"), { recursive: true }),
    mkdir(join(stack, "state"), { recursive: true }),
    mkdir(tmp, { recursive: true }),
  ]);
  await writeFile(join(stack, ".env"), "A=1\n");
  await writeFile(join(stack, "secrets", "token"), "t\n");
  if (withRecipient) {
    await writeFile(join(stack, "secrets", "backup-age-recipient.txt"), "age1publickeyonly\n");
  }
  await writeFile(join(root, "approle.json"), "{}");
  await writeFile(join(bin, "docker"), FAKE_DOCKER);
  await writeFile(join(bin, "age"), FAKE_AGE);
  await chmod(join(bin, "docker"), 0o755);
  await chmod(join(bin, "age"), 0o755);
  const logFile = join(root, "docker.log");
  await writeFile(logFile, "");
  return {
    backups,
    log: () => readFile(logFile, "utf8"),
    run: async (env = {}) => {
      const result = await runCommand("bash", [SCRIPT], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          STACK_DIR: stack,
          BACKUP_ROOT: backups,
          VAULT_APPROLE_FILE: join(root, "approle.json"),
          FAKE_LOG: logFile,
          FAKE_TMP: tmp,
          LOCK_WAIT_SECONDS: "2",
          VAULT_WAIT_SECONDS: "4",
          BACKUP_VOLUMES: "veta_minio-data missing-volume",
          ...env,
        },
      });
      return { code: result.code, stdout: result.stdout };
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function backupDirs(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.startsWith("full-")).sort();
}

test("[full-backup] a successful run writes only encrypted files plus checksums", async () => {
  const box = await sandbox();
  try {
    const result = await box.run();
    assertEquals(result.code, 0);
    const [dir] = await backupDirs(box.backups);
    const files = await readdir(join(box.backups, dir));
    for (const expected of [
      "veta-postgres.dump.age",
      "veta-postgres.roles.sql.age",
      "authentik-postgres.dump.age",
      "volume-veta_minio-data.tgz.age",
      "stack-config.tgz.age",
      "secrets-openbao-data.tgz.age",
      "secrets-openbao-unseal.tgz.age",
      "secrets-deploy-approle.json.age",
      "versions.txt",
      "SHA256SUMS",
    ]) {
      assert(files.includes(expected), `missing ${expected}`);
    }
    assert(!files.some((f) => /\.(dump|tgz|sql|json)$/.test(f)), "plaintext artefact left behind");
    assert(!files.includes("volume-missing-volume.tgz.age"));
    assert((await readdir(box.backups)).every((f) => !f.startsWith(".work-")));
    assert((await readFile(join(box.backups, "last-success"), "utf8")).trim().length > 0);
  } finally {
    await box.cleanup();
  }
});

test("[full-backup] the vault is stopped for the archive and always started again", async () => {
  const box = await sandbox();
  try {
    await box.run();
    const lines = (await box.log()).split("\n");
    const stop = lines.findIndex((l) => l.startsWith("stop veta-openbao"));
    const start = lines.findIndex((l) => l.startsWith("start veta-openbao"));
    assert(stop >= 0 && start > stop, "vault was not stopped then started");
  } finally {
    await box.cleanup();
  }
});

test("[full-backup] a failed run leaves no backup directory, no plaintext, and no success marker", async () => {
  const box = await sandbox();
  try {
    const result = await box.run({ FAKE_DUMP_EMPTY: "1" });
    assert(result.code !== 0);
    assertEquals(
      (await readdir(box.backups)).filter((f) => f !== "last-success"),
      []
    );
  } finally {
    await box.cleanup();
  }
});

test("[full-backup] a dump that cannot be read back fails the run", async () => {
  const box = await sandbox();
  try {
    const result = await box.run({ FAKE_RESTORE_FAIL: "1" });
    assert(result.code !== 0);
    assertEquals(await backupDirs(box.backups), []);
  } finally {
    await box.cleanup();
  }
});

test("[full-backup] refuses to run without an age recipient", async () => {
  const box = await sandbox(false);
  try {
    const result = await box.run();
    assert(result.code !== 0);
    assert(result.stdout.includes("no age recipient file"));
    assertEquals((await readFile(join(box.backups, "..", "docker.log"), "utf8")).trim(), "");
  } finally {
    await box.cleanup();
  }
});

test("[full-backup] keeps only the newest BACKUP_KEEP backups", async () => {
  const box = await sandbox();
  try {
    await mkdir(box.backups, { recursive: true });
    for (const stamp of ["20260101T000000Z", "20260102T000000Z", "20260103T000000Z"]) {
      await mkdir(join(box.backups, `full-${stamp}`));
    }
    const result = await box.run({ BACKUP_KEEP: "2" });
    assertEquals(result.code, 0);
    const kept = await backupDirs(box.backups);
    assertEquals(kept.length, 2);
    assert(!kept.includes("full-20260101T000000Z"));
    assert(!kept.includes("full-20260102T000000Z"));
  } finally {
    await box.cleanup();
  }
});
