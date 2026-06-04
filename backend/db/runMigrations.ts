import { join } from "https://deno.land/std@0.210.0/path/mod.ts";
import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(
  databaseUrl: string,
  opts: { migrationsDir?: string; quiet?: boolean } = {}
): Promise<MigrationResult> {
  const log = opts.quiet ? () => {} : (msg: string) => console.log(msg);
  const dirname = import.meta.dirname;
  if (!dirname) {
    throw new Error("runMigrations requires import.meta.dirname");
  }
  const dir = opts.migrationsDir ?? join(dirname, "migrations");

  const pool = new Pool(databaseUrl, 1, false);
  const client = await pool.connect();

  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version    TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const entries: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(".sql")) entries.push(entry.name);
    }
    entries.sort();

    const { rows } = await client.queryArray<[string]>(
      "SELECT version FROM public.schema_migrations"
    );
    const alreadyApplied = new Set(rows.map(([v]) => v));

    for (const filename of entries) {
      const version = filename.replace(".sql", "");
      if (alreadyApplied.has(version)) {
        log(`  [skip] ${version}`);
        skipped.push(version);
        continue;
      }
      log(`  [apply] ${version}`);
      const sql = await Deno.readTextFile(join(dir, filename));
      await client.queryArray(sql);
      await client.queryArray(
        "INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
        [version]
      );
      applied.push(version);
      log(`  [done] ${version}`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  return { applied, skipped };
}
