import { runMigrations } from "./runMigrations.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  Deno.exit(1);
}

try {
  const { applied, skipped } = await runMigrations(databaseUrl);
  console.log(
    `Migrations complete: ${applied.length} applied, ${skipped.length} skipped.`,
  );
} catch (err) {
  console.error("Migration failed:", err);
  Deno.exit(1);
}
