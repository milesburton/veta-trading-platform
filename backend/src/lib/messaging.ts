// fallow-ignore-file complexity

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
import { logger } from "@veta/logger";
import type { z } from "@veta/zod";
import {
  injectTraceContext,
  recordGauge,
  withExtractedContext,
} from "./telemetry.ts";

const LIB = { component: "messaging" };

const BROKERS = (Deno.env.get("REDPANDA_BROKERS") ?? "localhost:9092")
  .split(",")
  .map((b) => b.trim());

const DEFAULT_MAX_IN_FLIGHT = 500;

const DROPPABLE_TOPIC_PREFIXES = ["market.", "algo.heartbeat"];

export function isDroppableTopic(topic: string): boolean {
  return DROPPABLE_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix));
}

function maxInFlightFromEnv(): number {
  const parsed = Number(Deno.env.get("PRODUCER_MAX_IN_FLIGHT"));
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_IN_FLIGHT;
}

// fallow-ignore-next-line unused-type
export interface KafkaFactoryLike {
  producer(): Producer;
  consumer(config: { groupId: string }): Consumer;
}

type KafkaFactory = (clientId: string) => KafkaFactoryLike;
type SleepFn = (ms: number) => Promise<void>;
type ScheduleFn = (fn: () => void, ms: number) => void;

let kafkaFactory: KafkaFactory = makeKafka;
let sleepFn: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));
let scheduleFn: ScheduleFn = (fn, ms) => {
  setTimeout(fn, ms);
};

function makeKafka(clientId: string): Kafka {
  return new Kafka({
    clientId,
    brokers: BROKERS,
    // Redpanda is typically local — short timeouts are fine and make startup faster
    connectionTimeout: 5_000,
    requestTimeout: 15_000,
    retry: {
      initialRetryTime: 500,
      retries: 5,
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
  options: { maxInFlight?: number } = {},
): Promise<MsgProducer> {
  let activeProducer: Producer | null = null;
  let stopped = false;
  let reconnecting = false;
  const maxInFlight = options.maxInFlight ?? maxInFlightFromEnv();
  let inFlight = 0;
  let droppedTotal = 0;
  let saturated = false;
  const slotWaiters: Array<() => void> = [];

  function setSaturated(next: boolean) {
    if (next === saturated) return;
    saturated = next;
    const attrs = { client_id: clientId };
    recordGauge("messaging_producer_saturated", next ? 1 : 0, {
      description: "1 while the producer is at its in-flight send limit",
      attributes: attrs,
    }).catch(() => {});
    const fields = { ...LIB, clientId, maxInFlight, droppedTotal };
    if (next) {
      logger.warn("producer saturated, shedding droppable sends", fields);
    } else {
      logger.info("producer no longer saturated", fields);
    }
  }

  function recordDrop(topic: string) {
    droppedTotal += 1;
    recordGauge("messaging_producer_dropped_total", droppedTotal, {
      description: "Sends dropped because the producer was saturated",
      attributes: { client_id: clientId },
    }).catch(() => {});
    logger.debug("producer dropped send", { ...LIB, clientId, topic });
  }

  async function acquireSlot(topic: string): Promise<boolean> {
    if (inFlight < maxInFlight) {
      inFlight += 1;
      return true;
    }
    setSaturated(true);
    if (isDroppableTopic(topic)) {
      recordDrop(topic);
      return false;
    }
    await new Promise<void>((resolve) => slotWaiters.push(resolve));
    return true;
  }

  function releaseSlot() {
    const next = slotWaiters.shift();
    if (next) {
      next();
      return;
    }
    inFlight -= 1;
    if (inFlight < maxInFlight) setSaturated(false);
  }

  const MAX_DELAY_MS = 30_000;

  async function connectLoop() {
    let delay = 2_000;
    while (!stopped) {
      try {
        const kafka = kafkaFactory(clientId);
        const p: Producer = kafka.producer();
        await p.connect();
        activeProducer = p;
        reconnecting = false;
        logger.info("producer connected", { ...LIB, clientId });
        return;
      } catch (err) {
        logger.warn("producer connect failed, retrying", {
          ...LIB,
          clientId,
          retryInSecs: delay / 1000,
          err: err as Error,
        });
        await sleepFn(delay);
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
      if (!(await acquireSlot(topic))) {
        return;
      }
      const target = activeProducer;
      if (stopped || !target) {
        releaseSlot();
        return;
      }
      try {
        const headers: Record<string, string> = {};
        await injectTraceContext(headers);
        await target.send({
          topic,
          messages: [{ value: JSON.stringify(value), headers }],
        });
      } catch (err) {
        logger.warn("producer send failed, reconnecting", {
          ...LIB,
          clientId,
          err: err as Error,
        });
        activeProducer = null;
        if (!reconnecting) {
          reconnecting = true;
          connectLoop();
        }
        throw err; // re-throw so callers know the send failed
      } finally {
        releaseSlot();
      }
    },
    async disconnect(): Promise<void> {
      stopped = true;
      slotWaiters.splice(0).forEach((wake) => {
        inFlight += 1;
        wake();
      });
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
  options: { handlerTimeoutMs?: number } = {},
): Promise<MsgConsumer> {
  const handlerTimeoutMs = options.handlerTimeoutMs ?? 5_000;
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
        const kafka = kafkaFactory(clientId);
        const consumer: Consumer = kafka.consumer({ groupId });
        await consumer.connect();
        for (const topic of topics) {
          await consumer.subscribe({ topic, fromBeginning: false });
        }

        consumer.on("consumer.crash", async ({ payload }) => {
          if (stopped || gen !== generation) return;
          const crashErr = (payload as { error?: Error }).error;
          logger.warn("consumer crashed, restarting", {
            ...LIB,
            groupId,
            err: crashErr,
          });
          activeConsumer = null;
          try {
            await consumer.disconnect();
          } catch {
            /* best effort */
          }
          if (!reconnecting) {
            reconnecting = true;
            scheduleFn(() => {
              reconnecting = false;
              connectLoop();
            }, 3_000);
          }
        });

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
            const carrier: Record<string, unknown> = message.headers ?? {};
            await withExtractedContext(carrier, async () => {
              for (const handler of handlers) {
                let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
                try {
                  await Promise.race([
                    handler(topic, parsed),
                    new Promise((_, reject) => {
                      timeoutHandle = setTimeout(
                        () =>
                          reject(
                            new Error(
                              `handler timeout (${handlerTimeoutMs}ms)`,
                            ),
                          ),
                        handlerTimeoutMs,
                      );
                    }),
                  ]);
                } catch (err) {
                  logger.warn("consumer handler slow/failed", {
                    ...LIB,
                    groupId,
                    topic,
                    err: err as Error,
                  });
                } finally {
                  if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
                }
              }
            });
          },
        });
        activeConsumer = consumer;
        reconnecting = false;
        delay = 2_000;
        logger.info("consumer connected", { ...LIB, groupId, gen });
        return;
      } catch (err) {
        logger.warn("createConsumer failed, retrying", {
          ...LIB,
          groupId,
          retryInSecs: delay / 1000,
          err: err as Error,
        });
        await sleepFn(delay);
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

export interface TopicBinding<T> {
  topic: string;
  schema: z.ZodType<T>;
  handler(value: T): Promise<void> | void;
}

type AnyTopicBinding = TopicBinding<unknown>;

export interface TypedConsumerOptions {
  handlerTimeoutMs?: number;
  onInvalid?: (topic: string, raw: unknown, error: z.ZodError) => void;
}

export function createTypedConsumer(
  groupId: string,
  bindings: AnyTopicBinding[],
  options: TypedConsumerOptions = {},
): Promise<MsgConsumer> {
  const byTopic = new Map<string, AnyTopicBinding>();
  for (const b of bindings) {
    if (byTopic.has(b.topic)) {
      throw new Error(
        `createTypedConsumer: duplicate binding for topic '${b.topic}'`,
      );
    }
    byTopic.set(b.topic, b);
  }

  const onInvalid = options.onInvalid ??
    ((topic, _raw, err) => {
      logger.warn("typed consumer dropped invalid message", {
        ...LIB,
        groupId,
        topic,
        err,
      });
    });

  return createConsumer(groupId, [...byTopic.keys()], `veta-${groupId}`, {
    handlerTimeoutMs: options.handlerTimeoutMs,
  }).then((consumer) => {
    consumer.onMessage(async (topic, raw) => {
      const binding = byTopic.get(topic);
      if (!binding) {
        logger.warn("typed consumer received message for unbound topic", {
          ...LIB,
          groupId,
          topic,
        });
        return;
      }
      const result = binding.schema.safeParse(raw);
      if (!result.success) {
        onInvalid(topic, raw, result.error);
        return;
      }
      await binding.handler(result.data);
    });
    return consumer;
  });
}

// fallow-ignore-next-line unused-export
export function __setMessagingTestHooks(
  hooks: {
    kafkaFactory?: KafkaFactory;
    sleepFn?: SleepFn;
    scheduleFn?: ScheduleFn;
  } | null,
): void {
  kafkaFactory = hooks?.kafkaFactory ?? makeKafka;
  sleepFn = hooks?.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  scheduleFn = hooks?.scheduleFn ??
    ((fn, ms) => {
      setTimeout(fn, ms);
    });
}
