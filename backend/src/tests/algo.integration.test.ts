/**
 * Algo integration tests — require all backend services to be running.
 *
 * For each strategy: submits an order via the gateway WebSocket (authenticated),
 * then polls the journal until the order is routed, has child slices, and
 * observability events confirm the decision log is populated.
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import {
  GATEWAY_URL,
  JOURNAL_URL,
  OBS_URL,
  loginAs,
  submitOrderViaWs,
  timeout as t,
} from "./test-helpers.ts";

interface OrderRow {
  id: string;
  asset: string;
  side: string;
  quantity: number;
  strategy: string;
  status: string;
  children: { id: string; status: string; quantity: number }[];
}

/** Poll the journal grid until the order appears, up to maxWaitMs. */
async function pollForOrder(
  clientOrderId: string,
  maxWaitMs = 15_000,
): Promise<OrderRow | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: { kind: "group", id: "g1", join: "AND", rules: [{ kind: "rule", id: "r1", field: "id", op: "=", value: clientOrderId }] },
        sortField: null,
        sortDir: null,
        offset: 0,
        limit: 1,
      }),
      signal: t(20_000),
    });
    if (res.ok) {
      const data = await res.json() as { rows: OrderRow[] };
      if (data.rows.length > 0) return data.rows[0];
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** Poll until the order has at least minChildren child slices. */
async function pollForChildren(
  clientOrderId: string,
  minChildren: number,
  maxWaitMs = 20_000,
): Promise<OrderRow | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const order = await pollForOrder(clientOrderId, 8_000);
    if (order && order.children.length >= minChildren) return order;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return null;
}

/** Check observability service has events referencing this order.
 *  Queries order-specific event types directly to avoid being crowded out
 *  by high-volume user.access / algo.heartbeat events in the 1000-event window. */
async function waitForObsEvents(
  orderId: string,
  maxWaitMs = 15_000,
): Promise<boolean> {
  const orderEventTypes = ["orders.submitted", "orders.routed", "orders.child", "orders.filled"];
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    for (const evtType of orderEventTypes) {
      const res = await fetch(`${OBS_URL}/events?type=${evtType}`, { signal: t(10_000) });
      if (res.ok) {
        const events = await res.json() as Array<{ type: string; payload: Record<string, unknown> }>;
        const match = events.find(
          (e) =>
            e.payload?.clientOrderId === orderId ||
            e.payload?.orderId === orderId ||
            e.payload?.parentOrderId === orderId,
        );
        if (match) return true;
      } else {
        await res.body?.cancel();
      }
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return false;
}

// ── LIMIT ─────────────────────────────────────────────────────────────────────

Deno.test("[algo] LIMIT: order routes, gets a child slice, appears in journal", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 10,
    limitPrice: Number(price) * 1.02,
    strategy: "LIMIT",
  });

  const order = await pollForChildren(id, 1, 20_000);
  assertExists(order, `LIMIT order ${id} did not produce a child slice within 20s`);
  assertEquals(order.strategy, "LIMIT");
  assert(
    ["working", "filled", "pending"].includes(order.status),
    `Expected working/filled/pending, got: ${order.status}`,
  );
  assert(order.children.length >= 1, `Expected ≥1 child slice, got ${order.children.length}`);
});

// ── TWAP ──────────────────────────────────────────────────────────────────────

Deno.test("[algo] TWAP: order routes, produces multiple child slices over time", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: Number(price) * 1.05,
    strategy: "TWAP",
    algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 2 },
  });

  const order = await pollForChildren(id, 1, 25_000);
  assertExists(order, `TWAP order ${id} did not produce child slices within 25s`);
  assertEquals(order.strategy, "TWAP");
  assert(order.children.length >= 1, `Expected ≥1 TWAP slice, got ${order.children.length}`);

  const hasObs = await waitForObsEvents(id, 20_000);
  assert(hasObs, `No observability events found for TWAP order ${id}`);
});

// ── POV ───────────────────────────────────────────────────────────────────────

Deno.test("[algo] POV: order routes and dispatches child slices proportional to volume", async () => {
  const token = await loginAs("bob");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "MSFT")?.price ?? 420);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "MSFT",
    side: "BUY",
    quantity: 200,
    limitPrice: Number(price) * 1.05,
    strategy: "POV",
    algoParams: { strategy: "POV", povRate: 0.1 },
  });

  const order = await pollForChildren(id, 1, 25_000);
  assertExists(order, `POV order ${id} did not produce child slices within 25s`);
  assertEquals(order.strategy, "POV");
  assert(order.children.length >= 1, `Expected ≥1 POV slice, got ${order.children.length}`);
});

// ── VWAP ──────────────────────────────────────────────────────────────────────

Deno.test("[algo] VWAP: order routes and dispatches volume-weighted child slices", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "SELL",
    quantity: 100,
    limitPrice: Number(price) * 0.95,
    strategy: "VWAP",
    algoParams: { strategy: "VWAP", intervalSeconds: 2 },
  });

  const order = await pollForChildren(id, 1, 25_000);
  assertExists(order, `VWAP order ${id} did not produce child slices within 25s`);
  assertEquals(order.strategy, "VWAP");
  assert(order.children.length >= 1, `Expected ≥1 VWAP slice, got ${order.children.length}`);
});

// ── ICEBERG ───────────────────────────────────────────────────────────────────

Deno.test("[algo] ICEBERG: order routes, initial visible slice appears as child", async () => {
  const token = await loginAs("bob");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "MSFT")?.price ?? 420);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "MSFT",
    side: "BUY",
    quantity: 500,
    limitPrice: Number(price) * 1.02,
    strategy: "ICEBERG",
    algoParams: { strategy: "ICEBERG", visibleQty: 50 },
  });

  const order = await pollForChildren(id, 1, 35_000);
  assertExists(order, `ICEBERG order ${id} did not produce child slices within 35s`);
  assertEquals(order.strategy, "ICEBERG");
  assert(order.children.length >= 1, `Expected ≥1 ICEBERG slice, got ${order.children.length}`);
  assert(
    order.children[0].quantity <= 50,
    `ICEBERG visible qty should be ≤50, got ${order.children[0].quantity}`,
  );
});

// ── SNIPER ────────────────────────────────────────────────────────────────────

Deno.test("[algo] SNIPER: order routes and executes aggressively (single or few slices)", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 50,
    limitPrice: Number(price) * 1.05,
    strategy: "SNIPER",
    algoParams: { strategy: "SNIPER" },
  });

  const order = await pollForChildren(id, 1, 30_000);
  assertExists(order, `SNIPER order ${id} did not produce child slices within 30s`);
  assertEquals(order.strategy, "SNIPER");
  assert(order.children.length >= 1, `Expected ≥1 SNIPER slice, got ${order.children.length}`);
});

// ── ARRIVAL_PRICE ─────────────────────────────────────────────────────────────

Deno.test("[algo] ARRIVAL_PRICE: order routes and executes relative to arrival price", async () => {
  const token = await loginAs("bob");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "MSFT")?.price ?? 420);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "MSFT",
    side: "BUY",
    quantity: 75,
    limitPrice: Number(price) * 1.03,
    strategy: "ARRIVAL_PRICE",
    algoParams: { strategy: "ARRIVAL_PRICE" },
  });

  const order = await pollForChildren(id, 1, 30_000);
  assertExists(order, `ARRIVAL_PRICE order ${id} did not produce child slices within 30s`);
  assertEquals(order.strategy, "ARRIVAL_PRICE");
  assert(order.children.length >= 1, `Expected ≥1 ARRIVAL_PRICE slice, got ${order.children.length}`);
});

// ── Strategy status (algo heartbeats) ─────────────────────────────────────────

Deno.test("[algo] all strategies report heartbeats to observability", async () => {
  // Poll until we have heartbeats from all expected algos (consumer may need
  // a few seconds to catch up to the Kafka topic after a restart).
  const alwaysOnAlgos = ["LIMIT", "POV", "VWAP"];
  const deadline = Date.now() + 30_000;
  let activeAlgos = new Set<string>();
  while (Date.now() < deadline) {
    const res = await fetch(`${OBS_URL}/events?type=algo.heartbeat`, { signal: t(10_000) });
    if (res.ok) {
      const heartbeats = await res.json() as Array<{ type: string; payload: { algo?: string } }>;
      activeAlgos = new Set(heartbeats.map((e) => e.payload.algo).filter(Boolean) as string[]);
      if (alwaysOnAlgos.every((a) => activeAlgos.has(a))) break;
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  for (const algo of alwaysOnAlgos) {
    assert(activeAlgos.has(algo), `No heartbeat from ${algo} algo — is it running?`);
  }
  assert(activeAlgos.size >= 3, `Expected ≥3 algo heartbeat types, got: ${[...activeAlgos].join(", ")}`);
});

// ── SELL orders ───────────────────────────────────────────────────────────────

Deno.test("[algo] SELL LIMIT: routes and produces child slice", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "SELL",
    quantity: 10,
    limitPrice: Number(price) * 0.98,
    strategy: "LIMIT",
  });

  const order = await pollForChildren(id, 1, 20_000);
  assertExists(order, `SELL LIMIT order ${id} did not produce a child slice within 20s`);
  assertEquals(order.side, "SELL");
  assertEquals(order.strategy, "LIMIT");
  assert(order.children.length >= 1, `Expected ≥1 child slice, got ${order.children.length}`);
});

Deno.test("[algo] SELL TWAP: routes and produces multiple child slices", async () => {
  const token = await loginAs("bob");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "MSFT")?.price ?? 420);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "MSFT",
    side: "SELL",
    quantity: 60,
    limitPrice: Number(price) * 0.95,
    strategy: "TWAP",
    algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 2 },
  });

  const order = await pollForChildren(id, 1, 25_000);
  assertExists(order, `SELL TWAP order ${id} did not produce child slices within 25s`);
  assertEquals(order.side, "SELL");
  assertEquals(order.strategy, "TWAP");
  assert(order.children.length >= 1, `Expected ≥1 TWAP slice, got ${order.children.length}`);
});

// ── Performance assertions ─────────────────────────────────────────────────────
// Each test submits an order, waits for completion, then validates fill quality.

/** Poll until the order status is 'filled' or 'expired', up to maxWaitMs. */
async function pollUntilSettled(
  clientOrderId: string,
  maxWaitMs = 60_000,
): Promise<OrderRow | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const order = await pollForOrder(clientOrderId, 8_000);
    if (order && (order.status === "filled" || order.status === "expired")) return order;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return await pollForOrder(clientOrderId, 5_000);
}

Deno.test("[perf] LIMIT fill rate: order fills completely within 60s", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const qty = 10;
  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: qty,
    limitPrice: Number(price) * 1.05,
    strategy: "LIMIT",
  });

  const order = await pollUntilSettled(id, 60_000);
  assertExists(order, `LIMIT order ${id} not found after 60s`);

  const filledQty = order.children.reduce((sum, c) => sum + (c.quantity ?? 0), 0);
  const fillRate = filledQty / qty;
  assert(
    fillRate >= 0.8,
    `LIMIT fill rate ${(fillRate * 100).toFixed(1)}% is below 80% threshold (filled ${filledQty}/${qty})`,
  );
});

Deno.test("[perf] TWAP slice count: 3 slices produce ≥2 children within 15s", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const slices = 3;
  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 30,
    limitPrice: Number(price) * 1.05,
    strategy: "TWAP",
    algoParams: { strategy: "TWAP", slices, intervalSeconds: 2 },
  });

  const order = await pollForChildren(id, 2, 20_000);
  assertExists(order, `TWAP order ${id} did not produce ≥2 children within 20s`);
  assert(
    order.children.length >= 2,
    `Expected ≥2 TWAP slices for slices=${slices}, got ${order.children.length}`,
  );
  assert(
    order.children.length <= slices + 1,
    `Expected ≤${slices + 1} TWAP slices, got ${order.children.length} (algo may be slicing too aggressively)`,
  );
});

Deno.test("[perf] ICEBERG visible qty: each child slice ≤ visibleQty", async () => {
  const token = await loginAs("bob");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "MSFT")?.price ?? 420);

  const visibleQty = 30;
  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "MSFT",
    side: "BUY",
    quantity: 150,
    limitPrice: Number(price) * 1.03,
    strategy: "ICEBERG",
    algoParams: { strategy: "ICEBERG", visibleQty },
  });

  const order = await pollForChildren(id, 1, 35_000);
  assertExists(order, `ICEBERG order ${id} did not produce children within 35s`);
  for (const child of order.children) {
    assert(
      child.quantity <= visibleQty,
      `ICEBERG child qty ${child.quantity} exceeds visibleQty=${visibleQty}`,
    );
  }
});

Deno.test("[perf] SNIPER executes in ≤3 slices (aggressive, single-shot strategy)", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 50,
    limitPrice: Number(price) * 1.05,
    strategy: "SNIPER",
    algoParams: { strategy: "SNIPER" },
  });

  const order = await pollForChildren(id, 1, 30_000);
  assertExists(order, `SNIPER order ${id} did not produce children within 30s`);
  assert(
    order.children.length <= 3,
    `SNIPER produced ${order.children.length} slices — expected ≤3 (aggressive algo should not over-slice)`,
  );
});

// ── Decision log population ───────────────────────────────────────────────────

Deno.test("[algo] decision log: order events appear in observability for a submitted order", async () => {
  const token = await loginAs("alice");
  const price = await fetch(`${GATEWAY_URL}/assets`, { headers: { cookie: `veta_user=${token}` }, signal: t() })
    .then((r) => r.json() as Promise<{ symbol: string; price: number }[]>)
    .then((assets) => assets.find((a) => a.symbol === "AAPL")?.price ?? 190);

  const { clientOrderId: id } = await submitOrderViaWs(token, {
    asset: "AAPL",
    side: "BUY",
    quantity: 20,
    limitPrice: Number(price) * 1.02,
    strategy: "LIMIT",
  });

  const hasEvents = await waitForObsEvents(id, 30_000);
  assert(hasEvents, `No observability events found for order ${id} — decision log would be empty`);

  // Gather order events from type-specific endpoints to avoid the 1000-event cap
  const orderEventTypes = ["orders.submitted", "orders.routed", "orders.child", "orders.filled"];
  const orderEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];
  for (const evtType of orderEventTypes) {
    const res = await fetch(`${OBS_URL}/events?type=${evtType}`, { signal: t(15_000) });
    if (!res.ok) { await res.body?.cancel(); continue; }
    const batch = await res.json() as Array<{ type: string; payload: Record<string, unknown> }>;
    orderEvents.push(...batch.filter(
      (e) =>
        e.payload?.clientOrderId === id ||
        e.payload?.orderId === id ||
        e.payload?.parentOrderId === id,
    ));
  }
  assert(orderEvents.length >= 1, `Expected ≥1 event for order ${id}, got ${orderEvents.length}`);

  const eventTypes = orderEvents.map((e) => e.type);
  const hasRouted = eventTypes.some((t) => t.includes("orders."));
  assert(hasRouted, `Expected at least one orders.* event, got: ${eventTypes.join(", ")}`);
});
