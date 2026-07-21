import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { login, submitOrderViaWs } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 5_000) => AbortSignal.timeout(ms);

interface OrderRow {
  id: string;
  asset: string;
  side: string;
  quantity: number;
  strategy: string;
  status: string;
  children: { id: string; status: string; quantity: number }[];
}

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

async function pollForOrder(
  journalUrl: string,
  clientOrderId: string,
  maxWaitMs = 15_000
): Promise<OrderRow | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${journalUrl}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: {
          kind: "group",
          id: "g1",
          join: "AND",
          rules: [{ kind: "rule", id: "r1", field: "id", op: "=", value: clientOrderId }],
        },
        sortField: null,
        sortDir: null,
        offset: 0,
        limit: 1,
      }),
      signal: T(20_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { rows: OrderRow[] };
      if (data.rows.length > 0) return data.rows[0];
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function pollForChildren(
  journalUrl: string,
  clientOrderId: string,
  minChildren: number,
  maxWaitMs = 20_000
): Promise<OrderRow | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const order = await pollForOrder(journalUrl, clientOrderId, 8_000);
    if (order && order.children.length >= minChildren) return order;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return null;
}

async function withRetry<R>(label: string, attempts: number, fn: () => Promise<R>): Promise<R> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await Deno.stderr.write(
          new TextEncoder().encode(`[${label}] attempt ${i + 1} failed, retrying...\n`)
        );
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }
  throw lastErr;
}

// SNIPER, IS and MOMENTUM are not permitted for alice's persona post-migration
// 0010 (alice's allowed_strategies were stripped to LIMIT/TWAP/POV/VWAP/ICEBERG/
// ARRIVAL_PRICE). The dedicated `test-full-trader` user (added in migration
// 0016) has all 9 strategies enabled so these steps can run end-to-end.
const FULL_TRADER = "test-full-trader";

async function priceOf(
  stack: TestStack,
  token: string,
  symbol: string,
  fallback: number
): Promise<number> {
  const gw = url(stack, "gateway");
  const res = await fetch(`${gw}/assets`, {
    headers: { cookie: `veta_user=${token}` },
    signal: T(),
  });
  if (!res.ok) {
    await res.body?.cancel();
    return fallback;
  }
  const assets = (await res.json()) as { symbol: string; price: number }[];
  return assets.find((a) => a.symbol === symbol)?.price ?? fallback;
}

const SERVICES = [
  "market-sim",
  "ems",
  "oms",
  "limit-strategy",
  "twap-strategy",
  "pov-strategy",
  "vwap-strategy",
  "iceberg-strategy",
  "sniper-strategy",
  "arrival-price-strategy",
  "momentum-strategy",
  "is-strategy",
  "user-service",
  "journal",
  "risk-engine",
  "gateway",
] as const;

Deno.test({
  name: "algo strategies (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: [...SERVICES], startupTimeoutMs: 90_000 });
    const J = url(stack, "journal");
    try {
      await t.step("LIMIT routes and produces a child slice", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "BUY",
          quantity: 10,
          limitPrice: px * 1.02,
          strategy: "LIMIT",
        });
        const order = await pollForChildren(J, clientOrderId, 1, 25_000);
        assertExists(
          order,
          `LIMIT order ${clientOrderId} did not produce a child slice within 25s`
        );
        assertEquals(order?.strategy, "LIMIT");
        assert(order?.children.length >= 1);
      });

      await t.step("TWAP routes and produces child slices over time", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "BUY",
          quantity: 100,
          limitPrice: px * 1.05,
          strategy: "TWAP",
          algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 2 },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 25_000);
        assertExists(order);
        assertEquals(order?.strategy, "TWAP");
      });

      await t.step("POV routes and produces volume-proportional child slices", async () => {
        const token = await login(stack, "bob");
        const px = await priceOf(stack, token, "MSFT", 420);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "MSFT",
          side: "BUY",
          quantity: 200,
          limitPrice: px * 1.05,
          strategy: "POV",
          algoParams: { strategy: "POV", povRate: 0.1 },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 25_000);
        assertExists(order);
        assertEquals(order?.strategy, "POV");
      });

      await t.step("VWAP routes and produces volume-weighted child slices", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "SELL",
          quantity: 100,
          limitPrice: px * 0.95,
          strategy: "VWAP",
          algoParams: { strategy: "VWAP", intervalSeconds: 2 },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 25_000);
        assertExists(order);
        assertEquals(order?.strategy, "VWAP");
      });

      await t.step("ICEBERG initial visible slice ≤ visibleQty", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "BUY",
          quantity: 500,
          limitPrice: px * 1.2,
          strategy: "ICEBERG",
          expiresAt: 300,
          algoParams: { strategy: "ICEBERG", visibleQty: 50 },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 60_000);
        assertExists(order);
        assertEquals(order?.strategy, "ICEBERG");
        assert(order?.children[0].quantity <= 50);
      });

      await t.step("SNIPER routes and executes aggressively", async () => {
        await withRetry("SNIPER", 2, async () => {
          const token = await login(stack, FULL_TRADER);
          const px = await priceOf(stack, token, "AAPL", 190);
          const { clientOrderId } = await submitOrderViaWs(stack, token, {
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: px * 1.05,
            strategy: "SNIPER",
            algoParams: { strategy: "SNIPER" },
          });
          const order = await pollForChildren(J, clientOrderId, 1, 30_000);
          assertExists(order);
          assertEquals(order?.strategy, "SNIPER");
        });
      });

      await t.step("ARRIVAL_PRICE routes and produces children", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "BUY",
          quantity: 75,
          limitPrice: px * 1.2,
          strategy: "ARRIVAL_PRICE",
          expiresAt: 300,
          algoParams: { strategy: "ARRIVAL_PRICE", maxSlippageBps: 500 },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 60_000);
        assertExists(order);
        assertEquals(order?.strategy, "ARRIVAL_PRICE");
      });

      await t.step("SELL LIMIT routes and produces child slice", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "SELL",
          quantity: 10,
          limitPrice: px * 0.98,
          strategy: "LIMIT",
        });
        const order = await pollForChildren(J, clientOrderId, 1, 20_000);
        assertExists(order);
        assertEquals(order?.side, "SELL");
        assertEquals(order?.strategy, "LIMIT");
      });

      await t.step("SELL TWAP routes and produces child slices", async () => {
        const token = await login(stack, "bob");
        const px = await priceOf(stack, token, "MSFT", 420);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "MSFT",
          side: "SELL",
          quantity: 60,
          limitPrice: px * 0.95,
          strategy: "TWAP",
          algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 2 },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 25_000);
        assertExists(order);
        assertEquals(order?.side, "SELL");
        assertEquals(order?.strategy, "TWAP");
      });

      await t.step("[perf] TWAP slice count: 3 slices produce ≥2 children", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "BUY",
          quantity: 30,
          limitPrice: px * 1.05,
          strategy: "TWAP",
          algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 2 },
        });
        const order = await pollForChildren(J, clientOrderId, 2, 20_000);
        assertExists(order);
        assert(order?.children.length >= 2);
        assert(order?.children.length <= 4);
      });

      await t.step("[perf] ICEBERG visible qty: each child ≤ visibleQty", async () => {
        const token = await login(stack, "alice");
        const px = await priceOf(stack, token, "AAPL", 190);
        const visibleQty = 30;
        const { clientOrderId } = await submitOrderViaWs(stack, token, {
          asset: "AAPL",
          side: "BUY",
          quantity: 150,
          limitPrice: px * 1.2,
          strategy: "ICEBERG",
          expiresAt: 300,
          algoParams: { strategy: "ICEBERG", visibleQty },
        });
        const order = await pollForChildren(J, clientOrderId, 1, 60_000);
        assertExists(order);
        for (const c of order.children) {
          assert(c.quantity <= visibleQty, `child qty ${c.quantity} > visibleQty=${visibleQty}`);
        }
      });

      await t.step("[perf] SNIPER produces ≤3 slices", async () => {
        await withRetry("perf SNIPER", 2, async () => {
          const token = await login(stack, FULL_TRADER);
          const px = await priceOf(stack, token, "AAPL", 190);
          const { clientOrderId } = await submitOrderViaWs(stack, token, {
            asset: "AAPL",
            side: "BUY",
            quantity: 50,
            limitPrice: px * 1.05,
            strategy: "SNIPER",
            algoParams: { strategy: "SNIPER" },
          });
          const order = await pollForChildren(J, clientOrderId, 1, 30_000);
          assertExists(order);
          assert(order?.children.length <= 3, `SNIPER produced ${order?.children.length} slices`);
        });
      });

      await t.step("IS routes at least one child slice", async () => {
        await withRetry("IS", 2, async () => {
          const token = await login(stack, FULL_TRADER);
          const px = await priceOf(stack, token, "AAPL", 190);
          const { clientOrderId } = await submitOrderViaWs(stack, token, {
            asset: "AAPL",
            side: "BUY",
            quantity: 100,
            limitPrice: px * 1.05,
            strategy: "IS",
            algoParams: { strategy: "IS", urgency: 0.7, maxSlippageBps: 100 },
          });
          const order = await pollForChildren(J, clientOrderId, 1, 60_000);
          assertExists(order);
        });
      });

      await t.step("MOMENTUM routes at least one tranche (BUY or SELL)", async () => {
        await withRetry("MOMENTUM", 2, async () => {
          const token = await login(stack, FULL_TRADER);
          const px = await priceOf(stack, token, "AAPL", 190);
          const algoParams = {
            strategy: "MOMENTUM",
            entryThresholdBps: 0.01,
            maxTranches: 5,
            shortEmaPeriod: 2,
            longEmaPeriod: 3,
            cooldownTicks: 1,
          };
          const [buy, sell] = await Promise.all([
            submitOrderViaWs(stack, token, {
              asset: "AAPL",
              side: "BUY",
              quantity: 50,
              limitPrice: px * 1.1,
              strategy: "MOMENTUM",
              expiresAt: 300,
              algoParams,
            }),
            submitOrderViaWs(stack, token, {
              asset: "AAPL",
              side: "SELL",
              quantity: 50,
              limitPrice: px * 0.9,
              strategy: "MOMENTUM",
              expiresAt: 300,
              algoParams,
            }),
          ]);
          assertEquals(buy.event, "orderAck", `MOMENTUM BUY not accepted: ${JSON.stringify(buy)}`);
          assertEquals(
            sell.event,
            "orderAck",
            `MOMENTUM SELL not accepted: ${JSON.stringify(sell)}`
          );

          const deadline = Date.now() + 120_000;
          let fired = false;
          while (Date.now() < deadline) {
            const [b, s] = await Promise.all([
              pollForOrder(J, buy.clientOrderId, 5_000),
              pollForOrder(J, sell.clientOrderId, 5_000),
            ]);
            if ((b && b.children.length >= 1) || (s && s.children.length >= 1)) {
              fired = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 2_000));
          }
          assert(fired, "MOMENTUM: neither side produced a tranche within 120s");
        });
      });
    } catch (err) {
      await Deno.stderr.write(
        new TextEncoder().encode(`\n--- service logs ---\n${stack.dumpLogs()}`)
      );
      throw err;
    } finally {
      await stack.teardown();
    }
  },
});
