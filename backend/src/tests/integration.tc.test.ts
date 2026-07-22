import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 10_000) => AbortSignal.timeout(ms);

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

const SERVICES = [
  "market-sim",
  "ems",
  "oms",
  "limit-strategy",
  "twap-strategy",
  "pov-strategy",
  "vwap-strategy",
  "user-service",
  "journal",
  "fix-archive",
  "risk-engine",
  "gateway",
] as const;

const EMPTY_FILTER = { kind: "group", id: "root", join: "AND", rules: [] };

Deno.test({
  name: "service contracts + order flow (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: [...SERVICES], startupTimeoutMs: 90_000 });
    const GW = url(stack, "gateway");
    const MS = url(stack, "market-sim");
    const J = url(stack, "journal");
    const OMS = url(stack, "oms");
    const LIMIT = url(stack, "limit-strategy");
    const POV = url(stack, "pov-strategy");
    const VWAP = url(stack, "vwap-strategy");
    const TWAP = url(stack, "twap-strategy");
    const FIX = url(stack, "fix-archive");
    try {
      await t.step("[cors] OMS OPTIONS returns 204", async () => {
        const res = await fetch(OMS, { method: "OPTIONS", signal: T() });
        assertEquals(res.status, 204);
        await res.body?.cancel();
      });

      await t.step("[cors] gateway OPTIONS returns 204", async () => {
        const res = await fetch(GW, { method: "OPTIONS", signal: T() });
        assertEquals(res.status, 204);
        await res.body?.cancel();
      });

      await t.step("[market-sim] /assets returns asset list with AAPL", async () => {
        const res = await fetch(`${MS}/assets`, { signal: T() });
        assertEquals(res.status, 200);
        const assets = (await res.json()) as { symbol: string }[];
        assert(Array.isArray(assets) && assets.length > 0);
        assertExists(assets.find((a) => a.symbol === "AAPL"));
      });

      await t.step("[journal] /candles returns array", async () => {
        const res = await fetch(`${J}/candles?instrument=AAPL&interval=1m&limit=5`, {
          signal: T(),
        });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()));
      });

      await t.step("[journal] /orders returns array", async () => {
        const res = await fetch(`${J}/orders?limit=5`, { signal: T() });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()));
      });

      await t.step("[market] /assets returns enriched fields", async () => {
        const res = await fetch(`${MS}/assets`, { signal: T() });
        assertEquals(res.status, 200);
        const assets = (await res.json()) as {
          symbol: string;
          initialPrice: number;
          dailyVolume: number;
        }[];
        const aapl = assets.find((a) => a.symbol === "AAPL");
        assertExists(aapl);
        assert(aapl?.dailyVolume > 0);
        assert(aapl?.initialPrice > 0);
      });

      await t.step("[limit-algo] health includes pending count", async () => {
        const res = await fetch(`${LIMIT}/health`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { status: string; activeOrders: number };
        assertEquals(body.status, "ok");
        assertEquals(typeof body.activeOrders, "number");
      });

      await t.step("[pov-algo] health includes activeOrders count", async () => {
        const res = await fetch(`${POV}/health`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { status: string; activeOrders: number };
        assertEquals(body.status, "ok");
        assertEquals(typeof body.activeOrders, "number");
      });

      await t.step("[vwap-algo] health includes activeOrders count", async () => {
        const res = await fetch(`${VWAP}/health`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { status: string; activeOrders: number };
        assertEquals(body.status, "ok");
        assertEquals(typeof body.activeOrders, "number");
      });

      await t.step("[twap-algo] health is ok", async () => {
        const res = await fetch(`${TWAP}/health`, { signal: T() });
        assertEquals(res.status, 200);
        assertEquals(((await res.json()) as { status: string }).status, "ok");
      });

      await t.step("[fix-archive] /executions?symbol=AAPL returns filtered array", async () => {
        const res = await fetch(`${FIX}/executions?symbol=AAPL&limit=5`, { signal: T() });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()));
      });

      await t.step("[fix-archive] /executions/:nonexistent returns 404", async () => {
        const res = await fetch(`${FIX}/executions/NONEXISTENT-EXEC`, { signal: T() });
        assertEquals(res.status, 404);
        await res.body?.cancel();
      });

      await t.step("[gateway] WS connects and responds to submitOrder within 10s", async () => {
        const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
        const ws = new WebSocket(wsUrl);
        const closed = new Promise<void>((r) => {
          ws.onclose = () => r();
        });

        const result = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error("timeout"));
          }, 10_000);
          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                type: "submitOrder",
                payload: {
                  clientOrderId: `int-${Date.now()}`,
                  asset: "MSFT",
                  side: "BUY",
                  quantity: 25,
                  limitPrice: 420.0,
                  expiresAt: 30,
                  strategy: "LIMIT",
                  algoParams: { strategy: "LIMIT" },
                },
              })
            );
          };
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data as string) as { event: string };
            if (
              msg.event === "orderAck" ||
              msg.event === "orderRejected" ||
              msg.event === "error"
            ) {
              clearTimeout(timer);
              ws.close();
              resolve(msg.event);
            }
          };
          ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error("WS error"));
          };
        });
        await closed;
        assert(["orderAck", "orderRejected", "error"].includes(result), `unexpected: ${result}`);
      });

      await t.step("[oms] health is ok", async () => {
        const res = await fetch(`${OMS}/health`, { signal: T() });
        assertEquals(res.status, 200);
        assertEquals(((await res.json()) as { status: string }).status, "ok");
      });

      await t.step("[oms] POST / returns 404 (order submission moved to bus)", async () => {
        const res = await fetch(OMS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 150 }),
          signal: T(),
        });
        assertEquals(res.status, 404);
        await res.body?.cancel();
      });

      await t.step("[grid/query] POST /grid/query without auth returns 401", async () => {
        const res = await fetch(`${GW}/grid/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gridId: "orderBlotter",
            filterExpr: EMPTY_FILTER,
            sortField: null,
            sortDir: null,
            offset: 0,
            limit: 50,
          }),
          signal: T(),
        });
        assertEquals(res.status, 401);
        await res.body?.cancel();
      });

      await t.step("[grid/query] POST /grid/query with malformed body returns 400", async () => {
        const res = await fetch(`${J}/grid/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notAValidRequest: true }),
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step(
        "[grid/query] POST /grid/query direct to journal returns correct shape",
        async () => {
          const res = await fetch(`${J}/grid/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gridId: "orderBlotter",
              filterExpr: EMPTY_FILTER,
              sortField: null,
              sortDir: null,
              offset: 0,
              limit: 50,
            }),
            signal: T(8_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as { rows: unknown[]; total: number; evalMs: number };
          assert(Array.isArray(body.rows));
          assertEquals(typeof body.total, "number");
          assertEquals(typeof body.evalMs, "number");
        }
      );

      await t.step("[shared-workspaces] GET without auth returns 401", async () => {
        const res = await fetch(`${GW}/shared-workspaces`, { signal: T() });
        assertEquals(res.status, 401);
        await res.body?.cancel();
      });

      await t.step("[shared-workspaces] full lifecycle: POST → GET → DELETE", async () => {
        const aliceCookie = `veta_user=${await login(stack, "alice")}`;
        const bobCookie = `veta_user=${await login(stack, "bob")}`;

        const model = { global: {}, layout: { type: "row", children: [] } };
        const postRes = await fetch(`${GW}/shared-workspaces`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: aliceCookie },
          body: JSON.stringify({ name: "Test Workspace", model }),
          signal: T(),
        });
        assertEquals(postRes.status, 200);
        const { id } = (await postRes.json()) as { id: string };
        assertExists(id);

        const listRes = await fetch(`${GW}/shared-workspaces`, {
          headers: { cookie: bobCookie },
          signal: T(),
        });
        assertEquals(listRes.status, 200);
        const list = (await listRes.json()) as { id: string; name: string; ownerName: string }[];
        const found = list.find((e) => e.id === id);
        assertExists(found);
        assertEquals(found?.name, "Test Workspace");

        const bobDelete = await fetch(`${GW}/shared-workspaces/${id}`, {
          method: "DELETE",
          headers: { cookie: bobCookie },
          signal: T(),
        });
        assertEquals(bobDelete.status, 403);
        await bobDelete.body?.cancel();

        const aliceDelete = await fetch(`${GW}/shared-workspaces/${id}`, {
          method: "DELETE",
          headers: { cookie: aliceCookie },
          signal: T(),
        });
        assertEquals(aliceDelete.status, 200);
        await aliceDelete.body?.cancel();
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
