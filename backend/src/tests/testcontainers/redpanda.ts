import { GenericContainer, Wait } from "testcontainers";
import type { ManagedRedpanda } from "./types.ts";

const IMAGE = "redpandadata/redpanda:v24.3.4";
const INTERNAL_KAFKA_PORT = 9092;
const INTERNAL_ADMIN_PORT = 9644;

export interface RedpandaOptions {
  startupTimeoutMs?: number;
}

function pickFreePort(): number {
  const listener = Deno.listen({ port: 0 });
  const addr = listener.addr as Deno.NetAddr;
  listener.close();
  return addr.port;
}

export async function startEphemeralRedpanda(opts: RedpandaOptions = {}): Promise<ManagedRedpanda> {
  const hostPort = pickFreePort();
  const host = Deno.env.get("TESTCONTAINERS_HOST_OVERRIDE") ?? "127.0.0.1";

  const container = await new GenericContainer(IMAGE)
    .withExposedPorts({ container: INTERNAL_KAFKA_PORT, host: hostPort }, INTERNAL_ADMIN_PORT)
    .withCommand([
      "redpanda",
      "start",
      "--mode=dev-container",
      "--smp=1",
      "--memory=512M",
      "--reserve-memory=0M",
      "--overprovisioned",
      "--node-id=0",
      "--check=false",
      `--kafka-addr=PLAINTEXT://0.0.0.0:${INTERNAL_KAFKA_PORT}`,
      `--advertise-kafka-addr=PLAINTEXT://${host}:${hostPort}`,
    ])
    .withWaitStrategy(Wait.forLogMessage(/Successfully started Redpanda/, 1))
    .withStartupTimeout(opts.startupTimeoutMs ?? 90_000)
    .start();

  return {
    containerId: container.getId(),
    brokers: `${host}:${hostPort}`,
    host,
    port: hostPort,
    async teardown() {
      await container.stop();
    },
  };
}
