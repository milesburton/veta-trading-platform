import { Pool } from "#veta/db";

export const AUDIT_LOGIN_ROLE = "veta_audit";

export async function provisionAuditLogin(databaseUrl: string, password: string): Promise<void> {
  const pool = new Pool(databaseUrl, 1, false);
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.queryArray<[number]>(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [AUDIT_LOGIN_ROLE]
    );
    const verb = existing.length > 0 ? "ALTER" : "CREATE";
    const { rows } = await client.queryArray<[string]>(
      "SELECT format('%s ROLE %I LOGIN PASSWORD %L', $1::text, $2::text, $3::text)",
      [verb, AUDIT_LOGIN_ROLE, password]
    );
    await client.queryArray(rows[0][0]);
    await client.queryArray(`GRANT audit_writer TO ${AUDIT_LOGIN_ROLE}`);
  } finally {
    client.release();
    await pool.end();
  }
}
