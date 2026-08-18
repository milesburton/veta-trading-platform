import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { MsgProducer } from "@veta/messaging";
import { DEFAULT_EQUITY_SYMBOLS, LoadAgent } from "../gateway/load-agent.ts";

interface SentMessage {
  topic: string;
  value: Record<string, unknown>;
}

function makeFakeProducer(): { sent: SentMessage[]; producer: MsgProducer } {
  const sent: SentMessage[] = [];
  const producer = {
    send: (topic: string, value: unknown) => {
      sent.push({ topic, value: value as Record<string, unknown> });
      return Promise.resolve();
    },
    isReady: () => true,
  } as unknown as MsgProducer;
  return { sent, producer };
}

const noopPublish = () => {};
const refPriceFor = () => 100;

Deno.test("LoadAgent: starts and stops cleanly", () => {
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  const status = agent.start(
    { ratePerSecond: 1, autoStopAfterMs: 60_000 },
    { userId: "admin", role: "admin" }
  );
  assert(status.running);
  assert(status.startedAt !== null);
  agent.stop({ userId: "admin", role: "admin" });
  assertEquals(agent.status().running, false);
});

Deno.test("LoadAgent: throws on double-start", () => {
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  agent.start({ ratePerSecond: 1, autoStopAfterMs: 60_000 }, { userId: "admin", role: "admin" });
  let threw = false;
  try {
    agent.start({ ratePerSecond: 1 }, { userId: "admin", role: "admin" });
  } catch {
    threw = true;
  }
  agent.stop({ userId: "admin", role: "admin" });
  assert(threw);
});

Deno.test("LoadAgent: clamps rate to safety ceiling", () => {
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  const status = agent.start({ ratePerSecond: 10_000 }, { userId: "admin", role: "admin" });
  assertEquals(status.config?.ratePerSecond, 1_000);
  agent.stop({ userId: "admin", role: "admin" });
});

Deno.test("LoadAgent: clamps autoStop to 24h ceiling", () => {
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  const status = agent.start(
    { ratePerSecond: 1, autoStopAfterMs: 99 * 60 * 60 * 1000 },
    { userId: "admin", role: "admin" }
  );
  assertEquals(status.config?.autoStopAfterMs, 24 * 60 * 60 * 1000);
  agent.stop({ userId: "admin", role: "admin" });
});

Deno.test("LoadAgent: status reports stopped when not running", () => {
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  const status = agent.status();
  assertEquals(status.running, false);
  assertEquals(status.ordersSent, 0);
});

Deno.test("LoadAgent: defaults to equity symbols when none provided", () => {
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  const status = agent.start({ ratePerSecond: 1 }, { userId: "admin", role: "admin" });
  assertEquals(status.config?.symbols.length, DEFAULT_EQUITY_SYMBOLS.length);
  agent.stop({ userId: "admin", role: "admin" });
});

Deno.test("LoadAgent: emits orders to orders.new topic when ticking", async () => {
  const { producer, sent } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent: noopPublish });
  agent.start({ ratePerSecond: 100, autoStopAfterMs: 60_000 }, { userId: "admin", role: "admin" });
  await new Promise((r) => setTimeout(r, 350));
  agent.stop({ userId: "admin", role: "admin" });
  assert(sent.length > 0, `expected orders to be sent, got ${sent.length}`);
  assertEquals(sent[0].topic, "orders.new");
  assert("clientOrderId" in sent[0].value);
  assert("strategy" in sent[0].value);
});

Deno.test("LoadAgent: publishAccessEvent fires on start and stop", () => {
  const events: { action: string; userId: string }[] = [];
  const publishAccessEvent = (e: {
    action: string;
    userId?: string;
    userRole?: string;
    path?: string;
    reason?: string;
  }) => {
    events.push({ action: e.action, userId: e.userId ?? "" });
  };
  const { producer } = makeFakeProducer();
  const agent = new LoadAgent({ producer, refPriceFor, publishAccessEvent });
  agent.start({ ratePerSecond: 1 }, { userId: "admin", role: "admin" });
  agent.stop({ userId: "admin", role: "admin" });
  assertEquals(events.length, 2);
  assertEquals(events[0].action, "load_agent_start");
  assertEquals(events[1].action, "load_agent_stop");
});
