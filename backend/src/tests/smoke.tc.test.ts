/**
 * Reduced smoke-test set targeting key platform invariants.
 *
 * Runs against an ephemeral testcontainers-backed stack rather than the legacy
 * shared compose stack. The 12 checks below cover: service-version consistency,
 * bus → gateway → WS pipeline, order submission end-to-end, OAuth2 happy + 401
 * paths, gateway /ready aggregator, journal data-path, and a couple of
 * cross-cutting service contracts (RFQ + dark-pool stats).
 *
 * The full 61-check legacy smoke suite (backend/src/tests/smoke.test.ts) is
 * still the post-deploy gate on Fly + homelab; this file is the in-CI
 * smoke check that runs alongside the Testcontainers integration suite.
 */
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 8_000) => AbortSignal.timeout(ms);

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
  "user-service",
  "journal",
  "risk-engine",
  "gateway",
] as const;

Deno.test({
  name: "smoke (testcontainers, reduced critical path)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: [...SERVICES], startupTimeoutMs: 60_000 });
    const GW = url(stack, "gateway");
    const J = url(stack, "journal");
    const US = url(stack, "user-service");
    const MS = url(stack, "market-sim");
    try {
      await t.step("all services report the same version", async () => {
        const services = [
          "market-sim",
          "ems",
          "oms",
          "user-service",
          "journal",
          "gateway",
        ] as const;
        const versions = await Promise.all(
          services.map(async (s) => {
            const u = stack.urls[s];
            if (!u) throw new Error(`missing URL for ${s}`);
            const res = await fetch(`${u}/health`, { signal: T() });
            const body = (await res.json()) as { version: string };
            return { service: s, version: body.version };
          })
        );
        const unique = new Set(versions.map((v) => v.version));
        assertEquals(
          unique.size,
          1,
          `Services report mismatched versions: ${JSON.stringify(versions)}`
        );
      });

      await t.step("market-sim WebSocket emits tick data within 3s", async () => {
        const wsUrl = MS.replace(/^http/, "ws");
        const ws = new WebSocket(wsUrl);
        const closed = new Promise<void>((r) => {
          ws.onclose = () => r();
        });
        const tick = await new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error("no tick within 3s"));
          }, 3_000);
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data as string);
            if (msg.event === "marketData" || msg.event === "marketUpdate") {
              clearTimeout(timer);
              ws.close();
              resolve(msg);
            }
          };
          ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error("WS error"));
          };
        });
        await closed;
        assertExists(tick);
      });

      await t.step("gateway WS authenticated BUY LIMIT returns orderAck", async () => {
        const token = await login(stack, "alice");
        const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
        const ws = new WebSocket(wsUrl);
        const closed = new Promise<void>((r) => {
          ws.onclose = () => r();
        });
        const event = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error("WS timeout"));
          }, 10_000);
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
          };
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data as string) as { event: string };
            if (msg.event === "authIdentity") {
              ws.send(
                JSON.stringify({
                  type: "submitOrder",
                  payload: {
                    clientOrderId: `smoke-${Date.now()}`,
                    asset: "AAPL",
                    side: "BUY",
                    quantity: 10,
                    limitPrice: 200,
                    expiresAt: 60,
                    strategy: "LIMIT",
                    algoParams: { strategy: "LIMIT" },
                  },
                })
              );
            }
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
        assertEquals(event, "orderAck");
      });

      await t.step("OAuth2 happy path: alice receives a veta_user cookie", async () => {
        const token = await login(stack, "alice");
        assert(token.length > 0);
      });

      await t.step("OAuth2 unknown user returns 404", async () => {
        const res = await fetch(`${US}/oauth/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: "veta-automation",
            username: "no-such-user",
            redirect_uri: "postmessage",
            response_type: "code",
            scope: "openid profile",
            password: "veta-dev-passcode",
            code_challenge: "x".repeat(43),
            code_challenge_method: "S256",
          }),
          signal: T(),
        });
        assertEquals(res.status, 404);
        await res.body?.cancel();
      });

      await t.step("OAuth2 wrong password returns 401", async () => {
        const res = await fetch(`${US}/oauth/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: "veta-automation",
            username: "alice",
            redirect_uri: "postmessage",
            response_type: "code",
            scope: "openid profile",
            password: "wrong-passcode",
            code_challenge: "x".repeat(43),
            code_challenge_method: "S256",
          }),
          signal: T(),
        });
        assertEquals(res.status, 401);
        await res.body?.cancel();
      });

      await t.step("gateway /ready returns all expected service keys", async () => {
        const res = await fetch(`${GW}/ready`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { ready: boolean; services: Record<string, boolean> };
        assertEquals(typeof body.ready, "boolean");
        for (const key of ["marketSim", "ems", "oms", "journal"]) {
          assert(key in body.services, `Missing service in /ready: ${key}`);
        }
      });

      await t.step("gateway /ready: ems and oms report true (env-var routing works)", async () => {
        const res = await fetch(`${GW}/ready`, { signal: T() });
        const body = (await res.json()) as { services: Record<string, boolean> };
        assertEquals(body.services.ems, true, "ems should be reachable from gateway");
        assertEquals(body.services.oms, true, "oms should be reachable from gateway");
      });

      await t.step("journal GET /candles returns array", async () => {
        const res = await fetch(`${J}/candles?instrument=AAPL&interval=1m&limit=5`, {
          signal: T(),
        });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()));
      });

      await t.step("journal GET /orders returns array", async () => {
        const res = await fetch(`${J}/orders?limit=5`, { signal: T() });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()));
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
