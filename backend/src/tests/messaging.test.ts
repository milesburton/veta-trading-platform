import { assertEquals } from "jsr:@std/assert@0.217";

Deno.test({
  name: "[messaging] module exports createProducer and createConsumer",
  async fn() {
    const mod = await import("../lib/messaging.ts");
    assertEquals(typeof mod.createProducer, "function");
    assertEquals(typeof mod.createConsumer, "function");
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
