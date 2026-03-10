import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { join } from "https://deno.land/std@0.210.0/path/mod.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  Deno.exit(1);
}

const pool = new Pool(DATABASE_URL, 1, false);
const client = await pool.connect();

try {
  await client.queryArray(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = join(import.meta.dirname!, "migrations");
  const entries: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql")) entries.push(entry.name);
  }
  entries.sort();

  const { rows } = await client.queryArray<[string]>(
    "SELECT version FROM public.schema_migrations",
  );
  const applied = new Set(rows.map(([v]) => v));

  for (const filename of entries) {
    const version = filename.replace(".sql", "");
    if (applied.has(version)) {
      console.log(`  [skip] ${version}`);
      continue;
    }
    console.log(`  [apply] ${version}`);
    const sql = await Deno.readTextFile(join(migrationsDir, filename));
    await client.queryArray(sql);
    console.log(`  [done] ${version}`);
  }

  console.log("Migrations complete.");
} catch (err) {
  console.error("Migration failed:", err);
  Deno.exit(1);
} finally {
  client.release();
  await pool.end();
}
