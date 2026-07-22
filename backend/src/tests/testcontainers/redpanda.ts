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

// Every topic any service produces or consumes. Auto-creation
// (auto_create_topics_enable) lets each of the ~14+ services racing to
// connect at boot trigger topic creation concurrently the first time they
// subscribe/produce — the controller's partition leader assignment can lag
// behind that burst, so a consumer's very next ListOffsets call sometimes
// lands before its topic's leader is assigned ("does not host this
// topic-partition" / "not the leader for that topic-partition"). Explicitly
// creating every topic up front, before any service connects, removes the
// race instead of retrying around it.
const APPLICATION_TOPICS = [
  "algo.heartbeat",
  "ccp.margin",
  "ccp.novation",
  "ccp.settlement.complete",
  "ccp.settlement.queued",
  "dark.execution",
  "fix.execution",
  "grid.query",
  "llm.advisory.ready",
  "llm.job.queued",
  "llm.state.update",
  "llm.worker.status",
  "market.external.events",
  "market.features",
  "market.recommendations",
  "market.signals",
  "market.ticks",
  "news.events.normalised",
  "news.feed",
  "news.signal",
  "orders.cancelled",
  "orders.child",
  "orders.expired",
  "orders.fi.rfq",
  "orders.filled",
  "orders.held",
  "orders.kill",
  "orders.kill.audit",
  "orders.new",
  "orders.rejected",
  "orders.resume",
  "orders.resume.audit",
  "orders.resumed",
  "orders.routed",
  "orders.submitted",
  "orders.unhold",
  "products.created",
  "products.sold",
  "products.updated",
  "rfq.executed",
  "rfq.quote.update",
  "rfq.sellside.update",
  "risk.alerts",
  "risk.breaker",
  "user.access",
  "user.preferences",
  "user.session",
];

async function waitForClusterStable(brokers: string): Promise<void> {
  const kafka = new Kafka({ clientId: "cluster-stable-probe", brokers: [brokers] });
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = [CLUSTER_STABLE_PROBE_TOPIC, ...APPLICATION_TOPICS];
    await admin.createTopics({
      topics: topics.map((topic) => ({ topic, numPartitions: 1 })),
    });

    const deadline = Date.now() + CLUSTER_STABLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { topics: metadata } = await admin.fetchTopicMetadata({ topics });
      const allHaveLeaders = metadata.every((t) => t.partitions.every((p) => p.leader >= 0));
      if (allHaveLeaders) return;
      await new Promise((resolve) => setTimeout(resolve, CLUSTER_STABLE_POLL_INTERVAL_MS));
    }
    throw new Error(
      `Ephemeral Redpanda cluster did not stabilize (one or more topics have no leader) within ${CLUSTER_STABLE_TIMEOUT_MS}ms`
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
