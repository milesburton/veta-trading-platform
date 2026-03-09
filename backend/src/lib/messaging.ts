/**
 * Messaging abstraction over kafkajs, pointed at Redpanda.
 *
 * Usage:
 *   const producer = await createProducer();
 *   await producer.send("market.ticks", { prices: {...}, volumes: {...}, marketMinute: 1 });
 *   await producer.disconnect();
 *
 *   const consumer = await createConsumer("ems-group", ["orders.child"]);
 *   consumer.onMessage(async (topic, value) => { ... });
 *   // consumer runs until process exits; call consumer.disconnect() to stop.
 *
 * Environment variables:
 *   REDPANDA_BROKERS  comma-separated broker list  (default: localhost:9092)
 */

import { Kafka, type Producer, type Consumer, type KafkaMessage } from "npm:kafkajs@2.2.4";

const BROKERS = (Deno.env.get("REDPANDA_BROKERS") ?? "localhost:9092").split(",").map((b) => b.trim());

function makeKafka(clientId: string): Kafka {
  return new Kafka({
    clientId,
    brokers: BROKERS,
    // Redpanda is typically local — short timeouts are fine and make startup faster
    connectionTimeout: 5_000,
    requestTimeout: 10_000,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  });
}

// ── Producer ─────────────────────────────────────────────────────────────────

export interface MsgProducer {
  send(topic: string, value: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

export async function createProducer(clientId = "veta-producer"): Promise<MsgProducer> {
  const kafka = makeKafka(clientId);
  const producer: Producer = kafka.producer();
  await producer.connect();

  return {
    async send(topic: string, value: unknown): Promise<void> {
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(value) }],
      });
    },
    async disconnect(): Promise<void> {
      await producer.disconnect();
    },
  };
}

// ── Consumer ──────────────────────────────────────────────────────────────────

type MessageHandler = (topic: string, value: unknown) => Promise<void> | void;

export interface MsgConsumer {
  onMessage(handler: MessageHandler): void;
  disconnect(): Promise<void>;
}

export function createConsumer(
  groupId: string,
  topics: string[],
  clientId = `veta-${groupId}`,
): Promise<MsgConsumer> {
  const handlers: MessageHandler[] = [];
  let activeConsumer: Consumer | null = null;
  let stopped = false;

  // Connect in the background so callers get an immediate handle.
  // Services bind their HTTP port before Kafka is ready; message delivery
  // begins once the broker accepts the subscription.
  async function connectLoop() {
    const MAX_DELAY_MS = 30_000;
    let delay = 2_000;
    while (!stopped) {
      try {
        const kafka = makeKafka(clientId);
        const consumer: Consumer = kafka.consumer({ groupId });
        await consumer.connect();
        for (const topic of topics) {
          await consumer.subscribe({ topic, fromBeginning: false });
        }
        await consumer.run({
          eachMessage: async ({ topic, message }: { topic: string; message: KafkaMessage }) => {
            if (!message.value) return;
            let parsed: unknown;
            try { parsed = JSON.parse(message.value.toString()); } catch { return; }
            for (const handler of handlers) await handler(topic, parsed);
          },
        });
        activeConsumer = consumer;
        delay = 2_000; // reset backoff on success
        return; // connected — exit retry loop
      } catch (err) {
        console.warn(
          `[messaging] createConsumer(${groupId}) failed, retrying in ${delay / 1000}s:`,
          (err as Error).message,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      }
    }
  }

  connectLoop(); // fire-and-forget

  return Promise.resolve({
    onMessage(handler: MessageHandler): void {
      handlers.push(handler);
    },
    async disconnect(): Promise<void> {
      stopped = true;
      await activeConsumer?.disconnect();
    },
  });
}
