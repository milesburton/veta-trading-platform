import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { runCommand } from "../lib/process.ts";

const SCRIPT = new URL("../../../scripts/disk-monitor.py", import.meta.url).pathname;

const render = async (file: string): Promise<string[]> => {
  const program = [
    "import importlib.util,sys",
    `spec=importlib.util.spec_from_file_location("dm","${SCRIPT}")`,
    "m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
    "sys.stdout.write(m.render_metrics({'used_pct':1,'used_bytes':1,'free_bytes':1,'total_bytes':1}).decode())",
  ].join(";");
  const result = await runCommand("bash", ["-c", 'python3 -c "$1"', "_", program], {
    env: { ...process.env, BACKUP_METRICS_FILE: file },
  });
  assertEquals(result.code, 0);
  return result.stdout.split("\n");
};

test("[disk-monitor] serves the full backup metrics and drops anything else in the file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "disk-monitor-"));
  try {
    const file = join(dir, "full-backup.prom");
    await writeFile(
      file,
      [
        "# TYPE veta_full_backup_last_status gauge",
        "veta_full_backup_last_status 1",
        "veta_full_backup_last_size_bytes 12345",
        "disk_used_percent 99",
        'veta_full_backup_evil{a="b"} 1',
        "",
      ].join("\n")
    );
    const lines = await render(file);
    assert(lines.includes("veta_full_backup_last_status 1"));
    assert(lines.includes("veta_full_backup_last_size_bytes 12345"));
    assert(!lines.includes("disk_used_percent 99"));
    assert(!lines.some((line) => line.includes("evil")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("[disk-monitor] serves the disk metrics alone when no backup file exists", async () => {
  const lines = await render("/nonexistent/full-backup.prom");
  assert(lines.includes("disk_used_percent 1"));
  assert(!lines.some((line) => line.startsWith("veta_full_backup_")));
});
