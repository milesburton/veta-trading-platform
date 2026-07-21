import { Kafka } from "npm:kafkajs@2.2.4";
import { GenericContainer, Wait } from "testcontainers";
import type { ManagedRedpanda } from "./types.ts";

const IMAGE = "redpandadata/redpanda:v24.3.4";
const INTERNAL_KAFKA_PORT = 9092;
const INTERNAL_ADMIN_PORT = 9644;

// Default Kafka/Redpanda max produce message size (~1MB) is too small for a
// single tick's orderBook across the full instrument universe. Applied via
// the admin API post-start since it isn't a `redpanda start` CLI flag.
const KAFKA_BATCH_MAX_BYTES = 4 * 1024 * 1024;

export interface RedpandaOptions {
  startupTimeoutMs?: number;
}

function pickFreePort(): number {
  const listener = Deno.listen({ port: 0 });
  const addr = listener.addr as Deno.NetAddr;
  listener.close();
  return addr.port;
}

const CLUSTER_STABLE_PROBE_TOPIC = "__cluster_stable_probe";
const CLUSTER_STABLE_POLL_INTERVAL_MS = 250;
const CLUSTER_STABLE_TIMEOUT_MS = 15_000;

async function waitForClusterStable(brokers: string): Promise<void> {
  const kafka = new Kafka({ clientId: "cluster-stable-probe", brokers: [brokers] });
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic: CLUSTER_STABLE_PROBE_TOPIC, numPartitions: 1 }] });

    const deadline = Date.now() + CLUSTER_STABLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { topics } = await admin.fetchTopicMetadata({ topics: [CLUSTER_STABLE_PROBE_TOPIC] });
      const hasLeader = topics[0]?.partitions.every((p) => p.leader >= 0) ?? false;
      if (hasLeader) return;
      await new Promise((resolve) => setTimeout(resolve, CLUSTER_STABLE_POLL_INTERVAL_MS));
    }
    throw new Error(
      `Ephemeral Redpanda cluster did not stabilize (probe topic has no leader) within ${CLUSTER_STABLE_TIMEOUT_MS}ms`
    );
  } finally {
    await admin.disconnect();
  }
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

  const configResult = await container.exec([
    "rpk",
    "cluster",
    "config",
    "set",
    "kafka_batch_max_bytes",
    String(KAFKA_BATCH_MAX_BYTES),
    "--api-urls",
    `localhost:${INTERNAL_ADMIN_PORT}`,
  ]);
  if (configResult.exitCode !== 0) {
    throw new Error(
      `Failed to set kafka_batch_max_bytes on ephemeral Redpanda: ${configResult.output}`
    );
  }

  await waitForClusterStable(`${host}:${hostPort}`);

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
