import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { startEphemeralRedpanda } from "./testcontainers/redpanda.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

Deno.test({
  name: "[messaging] full producer + consumer roundtrip against real Redpanda",
  ignore: !SHOULD_RUN,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const rp = await startEphemeralRedpanda();
    Deno.env.set("REDPANDA_BROKERS", rp.brokers);
    const messaging = await import(
      `../lib/messaging.ts?broker=${encodeURIComponent(rp.brokers)}`
    );

    const topic = `test-roundtrip-${crypto.randomUUID().slice(0, 8)}`;

    try {
      await t.step(
        "producer connects and reports ready within a few seconds",
        async () => {
          const producer = await messaging.createProducer(
            `prod-${crypto.randomUUID().slice(0, 6)}`,
          );
          const deadline = Date.now() + 10_000;
          while (Date.now() < deadline && !producer.isReady()) {
            await new Promise((r) => setTimeout(r, 100));
          }
          assert(producer.isReady(), "producer should be ready within 10s");
          await producer.disconnect();
        },
      );

      await t.step(
        "send before connect is silently dropped (fire-and-forget)",
        async () => {
          const producer = await messaging.createProducer(
            `prod-fast-${crypto.randomUUID().slice(0, 6)}`,
          );
          await producer.send(topic, { early: true });
          await producer.disconnect();
        },
      );

      await t.step("consumer subscribes and receives messages", async () => {
        const groupId = `grp-${crypto.randomUUID().slice(0, 6)}`;
        const consumer = await messaging.createConsumer(groupId, [topic]);
        const received: { topic: string; value: unknown }[] = [];
        consumer.onMessage((t: string, v: unknown) => {
          received.push({ topic: t, value: v });
        });

        await new Promise((r) => setTimeout(r, 3_000));

        const producer = await messaging.createProducer(
          `prod-${crypto.randomUUID().slice(0, 6)}`,
        );
        const readyDeadline = Date.now() + 10_000;
        while (Date.now() < readyDeadline && !producer.isReady()) {
          await new Promise((r) => setTimeout(r, 100));
        }
        assert(producer.isReady(), "producer not ready");

        await producer.send(topic, { hello: "world", n: 1 });
        await producer.send(topic, { hello: "again", n: 2 });

        const recvDeadline = Date.now() + 10_000;
        while (Date.now() < recvDeadline && received.length < 2) {
          await new Promise((r) => setTimeout(r, 100));
        }
        assertEquals(received.length, 2);
        assertEquals((received[0].value as { hello: string }).hello, "world");
        assertEquals((received[1].value as { hello: string }).hello, "again");

        await producer.disconnect();
        await consumer.disconnect();
      });

      await t.step(
        "invalid JSON message is silently skipped, doesn't crash consumer",
        async () => {
          const skipTopic = `test-skip-${crypto.randomUUID().slice(0, 8)}`;
          const groupId = `grp-skip-${crypto.randomUUID().slice(0, 6)}`;
          const consumer = await messaging.createConsumer(groupId, [skipTopic]);
          let messagesReceived = 0;
          consumer.onMessage(() => {
            messagesReceived++;
          });
          await new Promise((r) => setTimeout(r, 3_000));

          const { Kafka } = await import("npm:kafkajs@2.2.4");
          const raw = new Kafka({ clientId: "raw", brokers: [rp.brokers] });
          const rawProducer = raw.producer();
          await rawProducer.connect();
          await rawProducer.send({
            topic: skipTopic,
            messages: [{ value: "not-json" }, { value: '{"valid": true}' }],
          });
          await rawProducer.disconnect();

          const deadline = Date.now() + 8_000;
          while (Date.now() < deadline && messagesReceived < 1) {
            await new Promise((r) => setTimeout(r, 100));
          }
          assertEquals(
            messagesReceived,
            1,
            "valid message should be received; invalid one skipped silently",
          );

          await consumer.disconnect();
        },
      );

      await t.step("disconnected producer's send is a no-op", async () => {
        const producer = await messaging.createProducer(
          `prod-disc-${crypto.randomUUID().slice(0, 6)}`,
        );
        await producer.disconnect();
        await producer.send(topic, { afterDisconnect: true });
      });
    } finally {
      await rp.teardown();
    }
  },
});
