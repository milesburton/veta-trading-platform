import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { FakeTime } from "jsr:@std/testing@0.217/time";
import type { GatewayContext } from "../gateway/context.ts";
import { handleDemoDay, testTraderIds } from "../gateway/routes/admin.ts";

const realFetch = globalThis.fetch;

interface ProducedOrder {
  userId?: string;
  userRole?: string;
  [k: string]: unknown;
}

function makeCtx(role: string): { ctx: GatewayContext; orders: ProducedOrder[] } {
  const orders: ProducedOrder[] = [];
  const ctx = {
    requireAuth: () => Promise.resolve({ user: { id: "admin-1", name: "Admin", role } }),
    producer: {
      isReady: () => true,
      send: (_topic: string, payload: ProducedOrder) => {
        orders.push(payload);
        return Promise.resolve();
      },
    },
    publishAccessEvent: () => {},
    urls: { marketSim: "http://market-sim.example" },
  } as unknown as GatewayContext;
  return { ctx, orders };
}

function stubMarketSim() {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify([{ symbol: "AAPL", price: 189 }]), { status: 200 })
    )) as typeof fetch;
}

Deno.test("[demo-day] orders are attributed to a trader persona, never the admin", async () => {
  Deno.env.set("LOAD_TEST_USER_IDS", "alice,bob");
  stubMarketSim();
  // Most demo-day orders are emitted on staggered setTimeout timers, so use
  // fake time to flush them deterministically after the handler returns.
  const time = new FakeTime();
  try {
    const { ctx, orders } = makeCtx("admin");
    const res = await handleDemoDay(
      new Request("http://gw/demo-day", { method: "POST", body: "{}" }),
      ctx
    );
    assertEquals(res.status, 202);
    await time.tickAsync(60_000);
    assert(orders.length > 0, "expected demo-day to emit orders");

    // The core invariant: an administrator must never appear as the originator
    // of a trade. Every emitted order must be attributed to a trader persona.
    for (const o of orders) {
      assertEquals(o.userRole, "trader", `order attributed to non-trader role ${o.userRole}`);
      assert(o.userId !== "admin-1", "order must not be attributed to the admin's id");
      assert(["alice", "bob"].includes(o.userId ?? ""), `unexpected attribution: ${o.userId}`);
    }
  } finally {
    time.restore();
    globalThis.fetch = realFetch;
    Deno.env.delete("LOAD_TEST_USER_IDS");
  }
});

Deno.test("[demo-day] refuses to run without trader personas configured", async () => {
  Deno.env.delete("LOAD_TEST_USER_IDS");
  stubMarketSim();
  try {
    const { ctx, orders } = makeCtx("admin");
    const res = await handleDemoDay(
      new Request("http://gw/demo-day", { method: "POST", body: "{}" }),
      ctx
    );
    assertEquals(res.status, 500);
    assertEquals(orders.length, 0, "must not emit any orders without personas");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("[demo-day] testTraderIds parses the env list", () => {
  Deno.env.set("LOAD_TEST_USER_IDS", " alice , bob ,, dave ");
  try {
    assertEquals(testTraderIds(), ["alice", "bob", "dave"]);
  } finally {
    Deno.env.delete("LOAD_TEST_USER_IDS");
  }
});
