import { GenericContainer, Wait } from "testcontainers";
import type { ManagedPostgres } from "./types.ts";

const IMAGE = "postgres:16-alpine";
const INTERNAL_PORT = 5432;

export interface PostgresOptions {
  database?: string;
  user?: string;
  password?: string;
  startupTimeoutMs?: number;
}

export async function startEphemeralPostgres(
  opts: PostgresOptions = {},
): Promise<ManagedPostgres> {
  const database = opts.database ?? "veta_test";
  const user = opts.user ?? "veta";
  const password = opts.password ?? "veta";

  const container = await new GenericContainer(IMAGE)
    .withExposedPorts(INTERNAL_PORT)
    .withEnvironment({
      POSTGRES_DB: database,
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
    })
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .withStartupTimeout(opts.startupTimeoutMs ?? 60_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(INTERNAL_PORT);
  const url = `postgres://${user}:${password}@${host}:${port}/${database}`;

  return {
    containerId: container.getId(),
    url,
    host,
    port,
    user,
    password,
    database,
    async teardown() {
      await container.stop();
    },
  };
}
