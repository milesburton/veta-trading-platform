import { assertEquals } from "jsr:@std/assert@0.217";

Deno.test({
  name: "[messaging] module exports createProducer, createConsumer, createTypedConsumer",
  async fn() {
    const mod = await import("../lib/messaging.ts");
    assertEquals(typeof mod.createProducer, "function");
    assertEquals(typeof mod.createConsumer, "function");
    assertEquals(typeof mod.createTypedConsumer, "function");
  },
});

Deno.test({
  name: "[messaging] createTypedConsumer throws synchronously on duplicate topic binding",
  async fn() {
    const { z } = await import("@veta/zod");
    const mod = await import("../lib/messaging.ts");
    const schema = z.object({ x: z.number() });
    let threw: Error | null = null;
    try {
      await mod.createTypedConsumer("dup-group", [
        { topic: "t1", schema, handler: () => {} },
        { topic: "t1", schema, handler: () => {} },
      ]);
    } catch (err) {
      threw = err as Error;
    }
    if (!threw) throw new Error("expected duplicate-topic check to throw");
    if (!threw.message.includes("duplicate binding for topic 't1'")) {
      throw new Error(`unexpected error: ${threw.message}`);
    }
  },
});

Deno.test({
  name: "[messaging] MsgProducer interface shape",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mod = await import("../lib/messaging.ts");
    const producer = await mod.createProducer("shape-test");
    assertEquals(typeof producer.isReady, "function");
    assertEquals(typeof producer.send, "function");
    assertEquals(typeof producer.disconnect, "function");
    assertEquals(producer.isReady(), false);
    await producer.disconnect();
  },
});

Deno.test({
  name: "[messaging] MsgConsumer interface shape",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mod = await import("../lib/messaging.ts");
    const consumer = await mod.createConsumer("shape-test", ["test-topic"], "shape-client");
    assertEquals(typeof consumer.onMessage, "function");
    assertEquals(typeof consumer.disconnect, "function");
    await consumer.disconnect();
  },
});
