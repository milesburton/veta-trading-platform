import { Pool } from "#veta/db";

export async function provisionLoginRole(
  databaseUrl: string,
  login: string,
  group: string,
  password: string
): Promise<void> {
  const pool = new Pool(databaseUrl, 1, false);
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.queryArray<[number]>(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [login]
    );
    const verb = existing.length > 0 ? "ALTER" : "CREATE";
    const { rows } = await client.queryArray<[string]>(
      "SELECT format('%s ROLE %I LOGIN PASSWORD %L', $1::text, $2::text, $3::text)",
      [verb, login, password]
    );
    await client.queryArray(rows[0][0]);
    await client.queryArray(`GRANT ${group} TO ${login}`);
  } finally {
    client.release();
    await pool.end();
  }
}
