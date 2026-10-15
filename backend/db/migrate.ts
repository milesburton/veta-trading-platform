import { runMigrations } from "./runMigrations.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

try {
  const { applied, skipped } = await runMigrations(databaseUrl);
  console.log(`Migrations complete: ${applied.length} applied, ${skipped.length} skipped.`);
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
