import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { FakeTime } from "jsr:@std/testing@0.217/time";
import {
  serveAlgoHealth,
  spawnKillWatchdog,
  startExpirySweep,
  startExpirySweepIndexed,
  startJournalProgressSweep,
} from "../algo/common-http.ts";
import type { OrderProgress, TrackedOrder } from "../algo/fill-progress.ts";

interface Sent {
  topic: string;
  msg: Record<string, unknown>;
}

function recordingProducer() {
  const sent: Sent[] = [];
  return {
    sent,
    producer: {
      send: (topic: string, msg: unknown) => {
        sent.push({ topic, msg: msg as Record<string, unknown> });
        return Promise.resolve();
      },
    },
  };
}

const expirable = (overrides: Record<string, unknown> = {}) => ({
  orderId: "o1",
  clientOrderId: "c1",
  expiresAt: 1_000,
  filledQty: 40,
  costBasis: 4_000,
  ...overrides,
});

const tracked = (overrides: Partial<TrackedOrder> = {}): TrackedOrder => ({
  orderId: "o1",
  clientOrderId: "c1",
  asset: "AAPL",
  side: "BUY",
  quantity: 100,
  expiresAt: 10_000,
  ...overrides,
});

Deno.test("[spawnKillWatchdog] kills the target process after the delay", async () => {
  const child = new Deno.Command("sleep", {
    args: ["30"],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn();
  spawnKillWatchdog(child.pid, 200);
  const status = await child.status;
  assertEquals(status.success, false);
  assertEquals(status.signal, "SIGKILL");
});

Deno.test({
  name: "[serveAlgoHealth] reports health, answers preflight and rejects other routes",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const port = 59_432;
    let active = 3;
    serveAlgoHealth(port, "twap-algo", "abc123", () => active);

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assertEquals(health.status, 200);
    assertEquals(await health.json(), {
      service: "twap-algo",
      version: "abc123",
      status: "ok",
      activeOrders: 3,
    });

    active = 0;
    const again = await fetch(`http://127.0.0.1:${port}/health`);
    assertEquals((await again.json()).activeOrders, 0);

    const preflight = await fetch(`http://127.0.0.1:${port}/health`, { method: "OPTIONS" });
    await preflight.body?.cancel();
    assert(preflight.status === 200 || preflight.status === 204);

    const unknown = await fetch(`http://127.0.0.1:${port}/nope`);
    assertEquals(unknown.status, 404);
    await unknown.body?.cancel();

    const wrongMethod = await fetch(`http://127.0.0.1:${port}/health`, { method: "POST" });
    assertEquals(wrongMethod.status, 404);
    await wrongMethod.body?.cancel();
  },
});

Deno.test("[startExpirySweep] expires overdue orders with their average fill and keeps live ones", async () => {
  const time = new FakeTime(0);
  try {
    const { sent, producer } = recordingProducer();
    const orders = new Map([
      ["o1", expirable()],
      ["o2", expirable({ orderId: "o2", expiresAt: 60_000 })],
      ["o3", expirable({ orderId: "o3", filledQty: 0, costBasis: 0 })],
    ]);
    startExpirySweep(orders, producer, "TWAP", "twap");

    await time.tickAsync(5_000);
    await time.runMicrotasks();

    assertEquals([...orders.keys()], ["o2"]);
    assertEquals(
      sent.map((s) => s.topic),
      ["orders.expired", "orders.expired"]
    );
    assertEquals(sent[0].msg.orderId, "o1");
    assertEquals(sent[0].msg.avgFillPrice, 100);
    assertEquals(sent[0].msg.algo, "TWAP");
    assertEquals(sent[1].msg.orderId, "o3");
    assertEquals(sent[1].msg.avgFillPrice, 0);
  } finally {
    time.restore();
  }
});

Deno.test("[startExpirySweep] tolerates a missing producer and a failing producer", async () => {
  const time = new FakeTime(0);
  try {
    const withoutProducer = new Map([["o1", expirable()]]);
    startExpirySweep(withoutProducer, null, "TWAP", "twap");

    const failing = new Map([["o2", expirable({ orderId: "o2" })]]);
    startExpirySweep(
      failing,
      { send: () => Promise.reject(new Error("broker down")) },
      "TWAP",
      "twap"
    );

    await time.tickAsync(5_000);
    await time.runMicrotasks();

    assertEquals(withoutProducer.size, 0);
    assertEquals(failing.size, 0);
  } finally {
    time.restore();
  }
});

Deno.test("[startExpirySweepIndexed] expires by numeric key and leaves unexpired orders", async () => {
  const time = new FakeTime(0);
  try {
    const { sent, producer } = recordingProducer();
    const orders = new Map([
      [1, expirable()],
      [2, expirable({ orderId: "o2", expiresAt: 60_000 })],
    ]);
    startExpirySweepIndexed(orders, producer, "MOMENTUM", "momentum");

    await time.tickAsync(5_000);
    await time.runMicrotasks();

    assertEquals([...orders.keys()], [2]);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].topic, "orders.expired");
    assertEquals(sent[0].msg.algo, "MOMENTUM");
    assertEquals(sent[0].msg.filledQty, 40);
  } finally {
    time.restore();
  }
});

Deno.test("[startJournalProgressSweep] leaves working orders alone", async () => {
  const time = new FakeTime(0);
  try {
    const { sent, producer } = recordingProducer();
    const orders = new Map([["o1", tracked()]]);
    const reader = () =>
      Promise.resolve<OrderProgress | null>({ filledQty: 10, avgFillPrice: 99 } as OrderProgress);
    startJournalProgressSweep(orders, reader, producer, "VWAP", "vwap", 1_000);

    await time.tickAsync(1_000);
    await time.runMicrotasks();

    assertEquals(orders.size, 1);
    assertEquals(sent, []);
  } finally {
    time.restore();
  }
});

Deno.test("[startJournalProgressSweep] publishes a complete heartbeat once the order is filled", async () => {
  const time = new FakeTime(0);
  try {
    const { sent, producer } = recordingProducer();
    const orders = new Map([["o1", tracked()]]);
    const reader = () =>
      Promise.resolve<OrderProgress | null>({
        filledQty: 100,
        avgFillPrice: 101.5,
      } as OrderProgress);
    startJournalProgressSweep(orders, reader, producer, "VWAP", "vwap", 1_000);

    await time.tickAsync(1_000);
    await time.runMicrotasks();

    assertEquals(orders.size, 0);
    assertEquals(sent.length, 1);
    assertEquals(sent[0].topic, "algo.heartbeat");
    assertEquals(sent[0].msg.event, "complete");
    assertEquals(sent[0].msg.filled, 100);
  } finally {
    time.restore();
  }
});

Deno.test("[startJournalProgressSweep] expires an unfilled order past its deadline, with or without journal data", async () => {
  const time = new FakeTime(0);
  try {
    const { sent, producer } = recordingProducer();
    const orders = new Map([
      ["o1", tracked({ expiresAt: 500 })],
      ["o2", tracked({ orderId: "o2", expiresAt: 500 })],
    ]);
    const reader = (orderId: string) =>
      Promise.resolve<OrderProgress | null>(
        orderId === "o1" ? ({ filledQty: 30, avgFillPrice: 98 } as OrderProgress) : null
      );
    startJournalProgressSweep(orders, reader, producer, "VWAP", "vwap", 1_000);

    await time.tickAsync(1_000);
    await time.runMicrotasks();

    assertEquals(orders.size, 0);
    assertEquals(
      sent.map((s) => s.topic),
      ["orders.expired", "orders.expired"]
    );
    assertEquals(sent[0].msg.filledQty, 30);
    assertEquals(sent[1].msg.filledQty, 0);
  } finally {
    time.restore();
  }
});

Deno.test("[startJournalProgressSweep] survives a failing progress reader and keeps sweeping", async () => {
  const time = new FakeTime(0);
  try {
    const { sent, producer } = recordingProducer();
    const orders = new Map([["o1", tracked()]]);
    let calls = 0;
    const reader = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("journal unavailable"))
        : Promise.resolve<OrderProgress | null>({
            filledQty: 100,
            avgFillPrice: 100,
          } as OrderProgress);
    };
    startJournalProgressSweep(orders, reader, producer, "VWAP", "vwap", 1_000);

    await time.tickAsync(1_000);
    await time.runMicrotasks();
    assertEquals(orders.size, 1);

    await time.tickAsync(1_000);
    await time.runMicrotasks();
    assertEquals(orders.size, 0);
    assertEquals(sent.length, 1);
  } finally {
    time.restore();
  }
});
