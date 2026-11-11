import { provisionAppLogin } from "./appRole.ts";
import { provisionAuditLogin } from "./auditRole.ts";
import { runMigrations } from "./runMigrations.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

try {
  const { applied, skipped } = await runMigrations(databaseUrl);
  console.log(`Migrations complete: ${applied.length} applied, ${skipped.length} skipped.`);
  const auditPassword = process.env.AUDIT_DB_PASSWORD;
  if (auditPassword) {
    await provisionAuditLogin(databaseUrl, auditPassword);
    console.log("Audit login role provisioned.");
  } else {
    console.warn("AUDIT_DB_PASSWORD is not set; the audit login role was not provisioned.");
  }
  const appPassword = process.env.APP_DB_PASSWORD;
  if (appPassword) {
    await provisionAppLogin(databaseUrl, appPassword);
    console.log("Application login role provisioned.");
  } else {
    console.warn("APP_DB_PASSWORD is not set; the application login role was not provisioned.");
  }
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
}
