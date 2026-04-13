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

import {
  type Consumer,
  Kafka,
  type KafkaMessage,
  type Producer,
} from "npm:kafkajs@2.2.4";

const BROKERS = (Deno.env.get("REDPANDA_BROKERS") ?? "localhost:9092").split(
  ",",
).map((b) => b.trim());

function makeKafka(clientId: string): Kafka {
  return new Kafka({
    clientId,
    brokers: BROKERS,
    // Redpanda is typically local — short timeouts are fine and make startup faster
    connectionTimeout: 5_000,
    requestTimeout: 15_000,
    retry: {
      initialRetryTime: 500,
      retries: 1,
    },
  });
}

export interface MsgProducer {
  send(topic: string, value: unknown): Promise<void>;
  disconnect(): Promise<void>;
  isReady(): boolean;
}

/**
 * Returns a producer immediately. Internally retries the Redpanda connection
 * with exponential backoff (2 s → 30 s). Messages sent before the broker is
 * ready are silently dropped (fire-and-forget services) or should be retried
 * by the caller. Once connected, the producer is reused for all sends.
 */
export function createProducer(
  clientId = "veta-producer",
): Promise<MsgProducer> {
  let activeProducer: Producer | null = null;
  let stopped = false;
  let reconnecting = false;

  const MAX_DELAY_MS = 30_000;

  async function connectLoop() {
    let delay = 2_000;
    while (!stopped) {
      try {
        const kafka = makeKafka(clientId);
        const p: Producer = kafka.producer();
        await p.connect();
        activeProducer = p;
        reconnecting = false;
        console.log(`[messaging] producer(${clientId}) connected`);
        return;
      } catch (err) {
        console.warn(
          `[messaging] producer(${clientId}) failed, retrying in ${
            delay / 1000
          }s:`,
          (err as Error).message,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      }
    }
  }

  connectLoop(); // fire-and-forget

  return Promise.resolve({
    isReady(): boolean {
      return activeProducer !== null;
    },
    async send(topic: string, value: unknown): Promise<void> {
      if (!activeProducer) {
        return;
      }
      try {
        await activeProducer.send({
          topic,
          messages: [{ value: JSON.stringify(value) }],
        });
      } catch (err) {
        console.warn(
          `[messaging] producer(${clientId}) send failed, reconnecting:`,
          (err as Error).message,
        );
        activeProducer = null;
        if (!reconnecting) {
          reconnecting = true;
          connectLoop();
        }
        throw err; // re-throw so callers know the send failed
      }
    },
    async disconnect(): Promise<void> {
      stopped = true;
      await activeProducer?.disconnect();
    },
  });
}

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
  let reconnecting = false;
  let generation = 0;

  async function connectLoop() {
    const MAX_DELAY_MS = 30_000;
    let delay = 2_000;
    const gen = ++generation;
    while (!stopped && gen === generation) {
      try {
        const kafka = makeKafka(clientId);
        const consumer: Consumer = kafka.consumer({ groupId });
        await consumer.connect();
        for (const topic of topics) {
          await consumer.subscribe({ topic, fromBeginning: false });
        }

        consumer.on("consumer.crash", async ({ payload }) => {
          if (stopped || gen !== generation) return;
          console.warn(
            `[messaging] consumer(${groupId}) crashed, restarting:`,
            (payload as { error?: Error }).error?.message ?? "unknown",
          );
          activeConsumer = null;
          try { await consumer.disconnect(); } catch { /* best effort */ }
          if (!reconnecting) {
            reconnecting = true;
            setTimeout(() => {
              reconnecting = false;
              connectLoop();
            }, 3_000);
          }
        });

        const HANDLER_TIMEOUT_MS = 5_000;

        await consumer.run({
          eachMessage: async (
            { topic, message }: { topic: string; message: KafkaMessage },
          ) => {
            if (!message.value) return;
            let parsed: unknown;
            try {
              parsed = JSON.parse(message.value.toString());
            } catch {
              return;
            }
            for (const handler of handlers) {
              try {
                await Promise.race([
                  handler(topic, parsed),
                  new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`handler timeout (${HANDLER_TIMEOUT_MS}ms)`)), HANDLER_TIMEOUT_MS)
                  ),
                ]);
              } catch (err) {
                console.warn(`[messaging] consumer(${groupId}) handler slow/failed:`, (err as Error).message);
              }
            }
          },
        });
        activeConsumer = consumer;
        reconnecting = false;
        delay = 2_000;
        console.log(`[messaging] consumer(${groupId}) connected (gen=${gen})`);
        return;
      } catch (err) {
        console.warn(
          `[messaging] createConsumer(${groupId}) failed, retrying in ${
            delay / 1000
          }s:`,
          (err as Error).message,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      }
    }
  }

  connectLoop();

  return Promise.resolve({
    onMessage(handler: MessageHandler): void {
      handlers.push(handler);
    },
    async disconnect(): Promise<void> {
      stopped = true;
      generation++;
      await activeConsumer?.disconnect();
    },
  });
}
