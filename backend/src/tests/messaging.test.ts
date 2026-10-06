import { assert, assertEquals, assertRejects } from "jsr:@std/assert@0.217";

import { z } from "@veta/zod";

import {
  __setMessagingTestHooks,
  createConsumer,
  createDedupeWindow,
  createProducer,
  createTypedConsumer,
  headerString,
  isDroppableTopic,
  MESSAGE_ID_HEADER,
  sendInChunks,
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
  sendGate: Promise<void> | null = null;

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.connectGate) await this.connectGate;
    if (this.connectError) throw this.connectError;
  }

  async send(payload: unknown): Promise<void> {
    this.sends.push(payload);
    if (this.sendGate) await this.sendGate;
    if (this.sendError) throw this.sendError;
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
    eachMessage: (
      payload: { topic: string; message: FakeMessage },
    ) => Promise<void>;
  } | null = null;
  crashHandler:
    | ((event: { payload: { error?: Error } }) => Promise<void>)
    | null = null;
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

  on(
    event: string,
    handler: (event: { payload: { error?: Error } }) => Promise<void>,
  ): void {
    if (event === "consumer.crash") this.crashHandler = handler;
  }

  run(config: {
    eachMessage: (
      payload: { topic: string; message: FakeMessage },
    ) => Promise<void>;
  }): Promise<void> {
    this.runConfig = config;
    return Promise.resolve();
  }

  async emitMessage(
    topic: string,
    value: unknown,
    headers?: Record<string, unknown>,
  ) {
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

type SentPayload = {
  topic: string;
  messages: { value: string; headers: Record<string, string> }[];
};

function withoutMessageIds(sends: unknown[]): unknown[] {
  return (sends as SentPayload[]).map(({ topic, messages }) => ({
    topic,
    messages: messages.map(({ value, headers }) => ({
      value,
      headers: Object.fromEntries(
        Object.entries(headers).filter(([key]) => key !== MESSAGE_ID_HEADER),
      ),
    })),
  }));
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
  delays: number[] = [],
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
  name:
    "[messaging] producer holds order sends until the initial connection and drops droppable sends",
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
    await producer.send("market.ticks", { px: 100 });
    let delivered = false;
    const pending = producer.send("orders.new", { id: 1 }).then(() => {
      delivered = true;
    });
    await drainMicrotasks();
    assertEquals(producerClient.sends.length, 0);
    assert(!delivered);

    gate.resolve();
    await pending;
    assert(producer.isReady());

    await producer.send("orders.new", { id: 2, side: "BUY" });
    assertEquals(withoutMessageIds(producerClient.sends), [
      {
        topic: "orders.new",
        messages: [{ value: JSON.stringify({ id: 1 }), headers: {} }],
      },
      {
        topic: "orders.new",
        messages: [
          {
            value: JSON.stringify({ id: 2, side: "BUY" }),
            headers: {},
          },
        ],
      },
    ]);

    await producer.disconnect();
    assertEquals(producerClient.disconnectCalls, 1);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] producer delivers order sends issued while reconnecting",
  async fn() {
    const failing = new FakeProducer();
    failing.sendError = new Error("broker gone");
    const replacement = new FakeProducer();
    const gate = deferred();
    replacement.connectGate = gate.promise;
    const attempts = [failing, replacement];
    installHooks(() => ({
      producer: () => attempts.shift() as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));

    const producer = await createProducer("reconnecting-producer");
    await waitFor(() => producer.isReady());
    await assertRejects(
      () => producer.send("orders.new", { id: 1 }),
      Error,
      "broker gone",
    );
    assert(!producer.isReady());

    await producer.send("market.ticks", { px: 101 });
    const pending = producer.send("orders.new", { id: 2 });
    gate.resolve();
    await pending;

    assertEquals(withoutMessageIds(replacement.sends), [
      {
        topic: "orders.new",
        messages: [{ value: JSON.stringify({ id: 2 }), headers: {} }],
      },
    ]);

    await producer.disconnect();
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] disconnect releases order sends waiting for a connection",
  async fn() {
    const producerClient = new FakeProducer();
    producerClient.connectGate = new Promise(() => {});
    installHooks(() => ({
      producer: () => producerClient as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));

    const producer = await createProducer("stopping-producer");
    const pending = producer.send("orders.new", { id: 1 });
    await producer.disconnect();
    await pending;
    assertEquals(producerClient.sends.length, 0);
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name:
    "[messaging] producer retries failed connect and reconnects after send failure",
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
      delays,
    );

    const producer = await createProducer("retrying-producer");
    await waitFor(() => producer.isReady());

    assertEquals(delays, [2000]);
    assert(producer.isReady());

    await assertRejects(
      () => producer.send("market.ticks", { px: 101 }),
      Error,
      "send blew up",
    );
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
  name:
    "[messaging] isDroppableTopic sheds tick-derived topics and keeps order topics",
  fn() {
    assert(isDroppableTopic("market.ticks"));
    assert(isDroppableTopic("market.signals"));
    assert(isDroppableTopic("algo.heartbeat"));
    assert(!isDroppableTopic("orders.child"));
    assert(!isDroppableTopic("orders.expired"));
    assert(!isDroppableTopic("fix.execution"));
  },
});

Deno.test({
  name:
    "[messaging] saturated producer drops droppable sends and queues order sends",
  async fn() {
    const producerClient = new FakeProducer();
    const gate = deferred();
    producerClient.sendGate = gate.promise;
    installHooks(() => ({
      producer: () => producerClient as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));

    const producer = await createProducer("bounded", { maxInFlight: 2 });
    await waitFor(() => producer.isReady());

    const first = producer.send("market.ticks", { n: 1 });
    const second = producer.send("orders.child", { n: 2 });
    await waitFor(() => producerClient.sends.length === 2);

    await producer.send("market.ticks", { n: 3 });
    const queued = producer.send("orders.child", { n: 4 });
    await drainMicrotasks();
    assertEquals(producerClient.sends.length, 2);

    gate.resolve();
    await Promise.all([first, second, queued]);

    const sentValues = producerClient.sends.map(
      (s) => (s as { messages: { value: string }[] }).messages[0].value,
    );
    assertEquals(sentValues, ['{"n":1}', '{"n":2}', '{"n":4}']);

    await producer.send("market.ticks", { n: 5 });
    assertEquals(producerClient.sends.length, 4);

    await producer.disconnect();
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name:
    "[messaging] disconnect releases sends waiting for a slot without sending them",
  async fn() {
    const producerClient = new FakeProducer();
    const gate = deferred();
    producerClient.sendGate = gate.promise;
    installHooks(() => ({
      producer: () => producerClient as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));

    const producer = await createProducer("bounded-stop", { maxInFlight: 1 });
    await waitFor(() => producer.isReady());

    const inFlight = producer.send("orders.child", { n: 1 });
    await waitFor(() => producerClient.sends.length === 1);
    const waiting = producer.send("orders.child", { n: 2 });

    await producer.disconnect();
    await waiting;
    assertEquals(producerClient.sends.length, 1);

    gate.resolve();
    await inFlight;
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name:
    "[messaging] consumer subscribes topics, parses valid messages, and ignores empty or invalid payloads",
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
  name:
    "[messaging] consumer swallows handler failures and timeouts and reconnects after crash",
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

    const consumer = await createConsumer(
      "risk-group",
      ["risk.alerts"],
      "risk-client",
      {
        handlerTimeoutMs: 1,
      },
    );

    const calls: string[] = [];
    consumer.onMessage((_topic, value) => {
      calls.push(`ok:${JSON.stringify(value)}`);
    });
    consumer.onMessage(() => {
      throw new Error("boom");
    });
    consumer.onMessage(() => new Promise<void>(() => {}));

    await waitFor(() =>
      first.runConfig !== null && first.crashHandler !== null
    );
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
      delays,
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
  name:
    "[messaging] typed consumer validates payloads, reports invalid, and ignores unbound topics",
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
      },
    );

    await waitFor(() => fakeConsumer.runConfig !== null);
    await fakeConsumer.emitMessage("typed.topic", JSON.stringify({ qty: 5 }));
    await fakeConsumer.emitMessage(
      "typed.topic",
      JSON.stringify({ qty: "bad" }),
    );
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
  name:
    "[messaging] createTypedConsumer throws synchronously on duplicate topic binding",
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

Deno.test({
  name: "[messaging] producer rejects order sends once the wait queue is full",
  async fn() {
    const producerClient = new FakeProducer();
    producerClient.connectGate = new Promise(() => {});
    installHooks(() => ({
      producer: () => producerClient as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));

    const producer = await createProducer("backlogged", { maxInFlight: 1 });
    const held = [
      producer.send("orders.new", { id: 1 }),
      producer.send("orders.new", { id: 2 }),
    ];
    await drainMicrotasks();
    await assertRejects(
      () => producer.send("orders.new", { id: 3 }),
      Error,
      "backlog full",
    );

    await producer.disconnect();
    await Promise.all(held);
    __setMessagingTestHooks(null);
  },
});

Deno.test("[messaging] sendInChunks keeps concurrent sends within the chunk size", async () => {
  let active = 0;
  let peak = 0;
  const sent: unknown[] = [];
  const producer = {
    async send(_topic: string, value: unknown) {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 0));
      sent.push(value);
      active--;
    },
  };

  await sendInChunks(producer, "market.features", Array.from({ length: 250 }, (_, i) => i), 100);

  assertEquals(sent.length, 250);
  assertEquals(peak, 100);
});

Deno.test("[messaging] sendInChunks continues past a failed send", async () => {
  const sent: unknown[] = [];
  const producer = {
    send(_topic: string, value: unknown) {
      if (value === 1) return Promise.reject(new Error("boom"));
      sent.push(value);
      return Promise.resolve();
    },
  };

  await sendInChunks(producer, "market.features", [0, 1, 2, 3], 2);

  assertEquals(sent, [0, 2, 3]);
});

Deno.test("[messaging] dedupe window flags repeats and evicts the oldest id", () => {
  const isDuplicate = createDedupeWindow(2);
  assertEquals(isDuplicate("a"), false);
  assertEquals(isDuplicate("a"), true);
  assertEquals(isDuplicate("b"), false);
  assertEquals(isDuplicate("c"), false);
  assertEquals(isDuplicate("a"), false);
  assertEquals(isDuplicate("c"), true);
});

Deno.test("[messaging] headerString reads string, buffer and array header values", () => {
  const buf = new TextEncoder().encode("from-buffer");
  const headers = {
    s: "plain",
    b: { toString: () => new TextDecoder().decode(buf) },
    a: ["first", "second"],
  } as never;
  assertEquals(headerString(headers, "s"), "plain");
  assertEquals(headerString(headers, "b"), "from-buffer");
  assertEquals(headerString(headers, "a"), "first");
  assertEquals(headerString(headers, "missing"), undefined);
  assertEquals(headerString(undefined, "s"), undefined);
});

Deno.test({
  name: "[messaging] producer stamps every send with a unique message id",
  async fn() {
    const producerClient = new FakeProducer();
    installHooks(() => ({
      producer: () => producerClient as never,
      consumer: () => {
        throw new Error("unused");
      },
    }));
    const producer = await createProducer("id-stamp");
    await waitFor(() => producer.isReady());
    await producer.send("orders.new", { id: 1 });
    await producer.send("orders.new", { id: 2 });
    const ids = producerClient.sends.map((payload) =>
      (payload as { messages: { headers: Record<string, string> }[] })
        .messages[0].headers[MESSAGE_ID_HEADER]
    );
    assertEquals(ids.length, 2);
    assert(ids.every((id) => typeof id === "string" && id.length > 0));
    assert(ids[0] !== ids[1]);
    await producer.disconnect();
    __setMessagingTestHooks(null);
  },
});

Deno.test({
  name: "[messaging] consumer delivers a redelivered message id only once",
  async fn() {
    const fakeConsumer = new FakeConsumer();
    installHooks(() => ({
      producer: () => {
        throw new Error("unused");
      },
      consumer: () => fakeConsumer as never,
    }));
    const consumer = await createConsumer("dedupe-group", ["orders.child"]);
    const seen: unknown[] = [];
    consumer.onMessage((_topic, value) => {
      seen.push(value);
    });
    await waitFor(() => fakeConsumer.runConfig !== null);

    const body = JSON.stringify({ id: 7 });
    await fakeConsumer.emitMessage("orders.child", body, { [MESSAGE_ID_HEADER]: "m-1" });
    await fakeConsumer.emitMessage("orders.child", body, { [MESSAGE_ID_HEADER]: "m-1" });
    await fakeConsumer.emitMessage("orders.child", body, { [MESSAGE_ID_HEADER]: "m-2" });
    await fakeConsumer.emitMessage("orders.child", body);
    await fakeConsumer.emitMessage("orders.child", body);
    await drainMicrotasks();

    assertEquals(seen.length, 4);
    await consumer.disconnect();
    __setMessagingTestHooks(null);
  },
});
