import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.217";

import { z } from "@veta/zod";

import {
  __setMessagingTestHooks,
  createConsumer,
  createProducer,
  createTypedConsumer,
  type KafkaFactoryLike,
} from "../lib/messaging.ts";

type FakeMessage = {
  value: { toString(): string } | null;
  headers?: Record<string, unknown>;
};

class FakeProducer {
  connectCalls = 0;
  disconnectCalls = 0;
  sends: unknown[] = [];
  connectError: Error | null = null;
  sendError: Error | null = null;
  connectGate: Promise<void> | null = null;

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.connectGate) await this.connectGate;
    if (this.connectError) throw this.connectError;
  }

  send(payload: unknown): Promise<void> {
    this.sends.push(payload);
    if (this.sendError) throw this.sendError;
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    return Promise.resolve();
  }
}

class FakeConsumer {
  connectCalls = 0;
  disconnectCalls = 0;
  subscriptions: { topic: string; fromBeginning: boolean }[] = [];
  runConfig: {
    eachMessage: (payload: { topic: string; message: FakeMessage }) => Promise<void>;
  } | null = null;
  crashHandler: ((event: { payload: { error?: Error } }) => Promise<void>) | null = null;
  connectError: Error | null = null;

  connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.connectError) throw this.connectError;
    return Promise.resolve();
  }

  subscribe(config: { topic: string; fromBeginning: boolean }): Promise<void> {
    this.subscriptions.push(config);
    return Promise.resolve();
  }

  on(event: string, handler: (event: { payload: { error?: Error } }) => Promise<void>): void {
    if (event === "consumer.crash") this.crashHandler = handler;
  }

  run(config: {
    eachMessage: (payload: { topic: string; message: FakeMessage }) => Promise<void>;
  }): Promise<void> {
    this.runConfig = config;
    return Promise.resolve();
  }

  async emitMessage(topic: string, value: unknown, headers?: Record<string, unknown>) {
    await this.runConfig?.eachMessage({
      topic,
      message: {
        value: value === null ? null : { toString: () => String(value) },
        headers,
      },
    });
  }

  disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    return Promise.resolve();
  }
}

function drainMicrotasks(): Promise<void> {
  return Promise.resolve();
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, attempts = 10): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await drainMicrotasks();
  }
}

function installHooks(
  factory: (clientId: string) => KafkaFactoryLike,
  delays: number[] = []
): void {
  __setMessagingTestHooks({
    kafkaFactory: factory,
    sleepFn: async (ms) => {
      delays.push(ms);
      await Promise.resolve();
    },
    scheduleFn: (fn) => {
      fn();
    },
  });
}

Deno.test({
  name: "[messaging] producer drops sends before initial connection, then serializes sends after connect",
  async fn() {
    const producerClient = new FakeProducer();
    const gate = deferred();
    producerClient.connectGate = gate.promise;
    installHooks(() => ({
      producer: () => producerClient as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));

    const producer = await createProducer("producer-shape");
    await producer.send("orders.new", { id: 1 });
    assertEquals(producerClient.sends.length, 0);

    gate.resolve();
    await drainMicrotasks();
    await drainMicrotasks();
    assert(producer.isReady());

    await producer.send("orders.new", { id: 2, side: "BUY" });
    assertEquals(producerClient.sends.length, 1);
    assertEquals(producerClient.sends[0], {
      topic: "orders.new",
      messages: [
        {
          value: JSON.stringify({ id: 2, side: "BUY" }),
          headers: {},
        },
      ],
    });

    await producer.disconnect();
    assertEquals(producerClient.disconnectCalls, 1);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] producer retries failed connect and reconnects after send failure",
  async fn() {
    const first = new FakeProducer();
    first.connectError = new Error("connect down");
    const second = new FakeProducer();
    second.sendError = new Error("send blew up");
    const third = new FakeProducer();
    const attempts = [first, second, third];
    const delays: number[] = [];

    installHooks(
      () => ({
        producer: () => attempts.shift() as never,
        consumer: () => {
          throw new Error("unused");
        },
      }),
      delays
    );

    const producer = await createProducer("retrying-producer");
    await waitFor(() => producer.isReady());

    assertEquals(delays, [2000]);
    assert(producer.isReady());

    await assertRejects(() => producer.send("market.ticks", { px: 101 }), Error, "send blew up");
    assertEquals(second.sends.length, 1);

    await waitFor(() => producer.isReady());
    assert(producer.isReady());

    await producer.send("market.ticks", { px: 102 });
    assertEquals(third.sends.length, 1);

    await producer.disconnect();
    assertEquals(third.disconnectCalls, 1);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] consumer subscribes topics, parses valid messages, and ignores empty or invalid payloads",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const fakeConsumer = new FakeConsumer();
    installHooks(() => ({
      producer: () => {
        throw new Error("unused");
      },
      consumer: () => fakeConsumer as never,
    }));

    const consumer = await createConsumer("fills-group", ["fills", "alerts"]);
    const seen: Array<[string, unknown]> = [];
    consumer.onMessage((topic, value) => {
      seen.push([topic, value]);
    });

    await waitFor(() => fakeConsumer.runConfig !== null);
    assertEquals(fakeConsumer.subscriptions, [
      { topic: "fills", fromBeginning: false },
      { topic: "alerts", fromBeginning: false },
    ]);

    await fakeConsumer.emitMessage("fills", JSON.stringify({ ok: true }));
    await fakeConsumer.emitMessage("fills", "{bad json");
    await fakeConsumer.emitMessage("fills", null);
    await drainMicrotasks();

    assertEquals(seen, [["fills", { ok: true }]]);

    await consumer.disconnect();
    assertEquals(fakeConsumer.disconnectCalls, 1);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] consumer swallows handler failures and timeouts and reconnects after crash",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const first = new FakeConsumer();
    const second = new FakeConsumer();
    const consumers = [first, second];

    installHooks(() => ({
      producer: () => {
        throw new Error("unused");
      },
      consumer: () => consumers.shift() as never,
    }));

    const consumer = await createConsumer("risk-group", ["risk.alerts"], "risk-client", {
      handlerTimeoutMs: 1,
    });

    const calls: string[] = [];
    consumer.onMessage((_topic, value) => {
      calls.push(`ok:${JSON.stringify(value)}`);
    });
    consumer.onMessage(() => {
      throw new Error("boom");
    });
    consumer.onMessage(() => new Promise<void>(() => {}));

    await waitFor(() => first.runConfig !== null && first.crashHandler !== null);
    assert(first.crashHandler);

    await first.emitMessage("risk.alerts", JSON.stringify({ x: 1 }), {
      traceparent: "00-test",
    });
    await drainMicrotasks();
    assertEquals(calls, ['ok:{"x":1}']);

    await first.crashHandler?.({ payload: { error: new Error("crash") } });
    await waitFor(() => second.runConfig !== null);
    assertEquals(first.disconnectCalls, 1);
    assertEquals(second.connectCalls, 1);

    await consumer.disconnect();
    await waitFor(() => second.disconnectCalls === 1);
    assertEquals(second.disconnectCalls, 1);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] consumer retries failed startup connection",
  async fn() {
    const bad = new FakeConsumer();
    bad.connectError = new Error("bootstrap down");
    const good = new FakeConsumer();
    const delays: number[] = [];
    const consumers = [bad, good];

    installHooks(
      () => ({
        producer: () => {
          throw new Error("unused");
        },
        consumer: () => consumers.shift() as never,
      }),
      delays
    );

    const consumer = await createConsumer("boot-group", ["boot.topic"]);
    await waitFor(() => good.runConfig !== null);

    assertEquals(delays, [2000]);
    assertEquals(good.subscriptions, [
      {
        topic: "boot.topic",
        fromBeginning: false,
      },
    ]);

    await consumer.disconnect();
    assertEquals(good.disconnectCalls, 1);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] typed consumer validates payloads, reports invalid, and ignores unbound topics",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const fakeConsumer = new FakeConsumer();
    installHooks(() => ({
      producer: () => {
        throw new Error("unused");
      },
      consumer: () => fakeConsumer as never,
    }));

    const invalid: Array<{ topic: string; raw: unknown; message: string }> = [];
    const handled: unknown[] = [];
    const consumer = await createTypedConsumer(
      "typed-group",
      [
        {
          topic: "typed.topic",
          schema: z.object({ qty: z.number() }),
          handler: (value) => {
            handled.push(value);
          },
        },
      ],
      {
        onInvalid: (topic, raw, error) => {
          invalid.push({ topic, raw, message: error.message });
        },
      }
    );

    await waitFor(() => fakeConsumer.runConfig !== null);
    await fakeConsumer.emitMessage("typed.topic", JSON.stringify({ qty: 5 }));
    await fakeConsumer.emitMessage("typed.topic", JSON.stringify({ qty: "bad" }));
    await fakeConsumer.emitMessage("other.topic", JSON.stringify({ qty: 7 }));
    await drainMicrotasks();

    assertEquals(handled, [{ qty: 5 }]);
    assertEquals(invalid.length, 1);
    assertEquals(invalid[0].topic, "typed.topic");
    assertEquals(invalid[0].raw, { qty: "bad" });

    await consumer.disconnect();
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] createTypedConsumer throws synchronously on duplicate topic binding",
  fn() {
    let err: unknown;
    try {
      createTypedConsumer("dup-group", [
        {
          topic: "t1",
          schema: z.object({ x: z.number() }),
          handler: () => {},
        },
        {
          topic: "t1",
          schema: z.object({ x: z.number() }),
          handler: () => {},
        },
      ]);
    } catch (caught) {
      err = caught;
    }
    assert(err instanceof Error);
    assert(err.message.includes("duplicate binding for topic 't1'"));
  },
});
