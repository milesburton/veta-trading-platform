import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { z } from "@veta/zod";
import { startEphemeralRedpanda } from "./testcontainers/redpanda.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

Deno.test({
  name: "[typed-consumer] validates per-topic schemas against real Redpanda",
  ignore: !SHOULD_RUN,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const rp = await startEphemeralRedpanda();
    Deno.env.set("REDPANDA_BROKERS", rp.brokers);
    const messaging = await import(`../lib/messaging.ts?broker=${encodeURIComponent(rp.brokers)}`);

    const orderTopic = `typed-order-${crypto.randomUUID().slice(0, 8)}`;
    const fillTopic = `typed-fill-${crypto.randomUUID().slice(0, 8)}`;
    const OrderSchema = z.object({ id: z.string(), qty: z.number().positive() });
    const FillSchema = z.object({ orderId: z.string(), price: z.number() });

    type Order = z.infer<typeof OrderSchema>;
    type Fill = z.infer<typeof FillSchema>;

    try {
      await t.step(
        "routes valid messages to the per-topic handler with typed payload",
        async () => {
          const orders: Order[] = [];
          const fills: Fill[] = [];
          const groupId = `typed-${crypto.randomUUID().slice(0, 6)}`;
          const consumer = await messaging.createTypedConsumer(groupId, [
            {
              topic: orderTopic,
              schema: OrderSchema,
              handler: (o: Order) => {
                orders.push(o);
              },
            },
            {
              topic: fillTopic,
              schema: FillSchema,
              handler: (f: Fill) => {
                fills.push(f);
              },
            },
          ]);

          await new Promise((r) => setTimeout(r, 3_000));

          const prod = await messaging.createProducer(`prod-${crypto.randomUUID().slice(0, 6)}`);
          const ready = Date.now() + 10_000;
          while (Date.now() < ready && !prod.isReady())
            await new Promise((r) => setTimeout(r, 100));

          await prod.send(orderTopic, { id: "o-1", qty: 10 });
          await prod.send(fillTopic, { orderId: "o-1", price: 100.5 });

          const deadline = Date.now() + 10_000;
          while (Date.now() < deadline && (orders.length < 1 || fills.length < 1)) {
            await new Promise((r) => setTimeout(r, 100));
          }
          assertEquals(orders.length, 1);
          assertEquals(orders[0], { id: "o-1", qty: 10 });
          assertEquals(fills.length, 1);
          assertEquals(fills[0], { orderId: "o-1", price: 100.5 });

          await prod.disconnect();
          await consumer.disconnect();
        }
      );

      await t.step("drops messages that fail schema validation; calls onInvalid", async () => {
        const orders: Order[] = [];
        const invalid: { topic: string; raw: unknown }[] = [];
        const groupId = `typed-invalid-${crypto.randomUUID().slice(0, 6)}`;
        const consumer = await messaging.createTypedConsumer(
          groupId,
          [
            {
              topic: orderTopic,
              schema: OrderSchema,
              handler: (o: Order) => {
                orders.push(o);
              },
            },
          ],
          {
            onInvalid: (topic: string, raw: unknown) => {
              invalid.push({ topic, raw });
            },
          }
        );
        await new Promise((r) => setTimeout(r, 3_000));

        const prod = await messaging.createProducer(`prod-bad-${crypto.randomUUID().slice(0, 6)}`);
        while (!prod.isReady()) await new Promise((r) => setTimeout(r, 100));

        await prod.send(orderTopic, { id: "o-2", qty: 5 });
        await prod.send(orderTopic, { id: "o-3", qty: -1 });
        await prod.send(orderTopic, { wrong: "shape" });
        await prod.send(orderTopic, { id: "o-4", qty: "ten" });

        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && (orders.length < 1 || invalid.length < 3)) {
          await new Promise((r) => setTimeout(r, 100));
        }
        assertEquals(orders.length, 1);
        assertEquals(orders[0].id, "o-2");
        assertEquals(invalid.length, 3);

        await prod.disconnect();
        await consumer.disconnect();
      });

      await t.step("uses default onInvalid (logs + drops) when none provided", async () => {
        const orders: Order[] = [];
        const groupId = `typed-default-${crypto.randomUUID().slice(0, 6)}`;
        const consumer = await messaging.createTypedConsumer(groupId, [
          {
            topic: orderTopic,
            schema: OrderSchema,
            handler: (o: Order) => {
              orders.push(o);
            },
          },
        ]);
        await new Promise((r) => setTimeout(r, 3_000));

        const prod = await messaging.createProducer(`prod-def-${crypto.randomUUID().slice(0, 6)}`);
        while (!prod.isReady()) await new Promise((r) => setTimeout(r, 100));

        await prod.send(orderTopic, { id: "o-5", qty: 100 });
        await prod.send(orderTopic, { totally: "wrong" });

        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline && orders.length < 1)
          await new Promise((r) => setTimeout(r, 100));
        assertEquals(orders.length, 1);

        await prod.disconnect();
        await consumer.disconnect();
      });

      await t.step("throws on duplicate topic bindings at construction time", async () => {
        let threw = false;
        try {
          await messaging.createTypedConsumer("dup-test", [
            { topic: orderTopic, schema: OrderSchema, handler: () => {} },
            { topic: orderTopic, schema: OrderSchema, handler: () => {} },
          ]);
        } catch (err) {
          threw = true;
          assert(err instanceof Error);
          assert(err.message.includes("duplicate binding"));
        }
        assert(threw, "expected duplicate binding to throw");
      });
    } finally {
      await rp.teardown();
    }
  },
});
