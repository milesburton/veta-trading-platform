import { join } from "https://deno.land/std@0.210.0/path/mod.ts";
import { runMigrations as run } from "../../../db/runMigrations.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;

export async function applyMigrations(databaseUrl: string): Promise<void> {
  await run(databaseUrl, {
    migrationsDir: join(REPO_ROOT, "backend/db/migrations"),
    quiet: true,
  });
}
