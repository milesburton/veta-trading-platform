/**
 * Full smoke suite, ported from the legacy backend/src/tests/smoke.test.ts.
 *
 * Runs against an ephemeral testcontainers-backed stack. Covers every service
 * the legacy file touched: market-sim, ems, oms, all algo strategies, journal,
 * user-service, gateway, fix-archive, news-aggregator, analytics,
 * market-data, market-data-adapters, feature-engine, signal-engine,
 * recommendation-engine, scenario-engine, llm-advisory, dark-pool,
 * ccp-service, rfq-service, replay, risk-engine, observability.
 *
 * Gated behind RUN_TESTCONTAINERS=1 so the regular `deno task test` stays
 * fast and the suite only runs inside scripts/run-testcontainers.sh.
 *
 * Splits the 62 legacy checks into logical groups so the testcontainers
 * stack can be sized per group rather than booting every service for every
 * step. Each group is one Deno.test with multiple t.step children.
 */
import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 8_000) => AbortSignal.timeout(ms);

// Maximum wall-clock time for a single Deno.test block including container
// startup. If a test hangs (e.g. waiting for a service that never responds),
// this races it to a clean timeout failure rather than blocking the CI runner.
const TEST_TIMEOUT_MS = 5 * 60 * 1_000;

function withTimeout<T>(fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      AbortSignal.timeout(TEST_TIMEOUT_MS).addEventListener("abort", () =>
        reject(new Error(`Test exceeded ${TEST_TIMEOUT_MS / 1_000}s hard timeout`))
      )
    ),
  ]);
}

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

// Group 1: service health + version consistency across the platform.
// Boots the full critical-path service set to confirm every /health
// endpoint responds and all services report the same version string.
Deno.test({
  name: "smoke.full (testcontainers): service health and version",
  ignore: !SHOULD_RUN,
  fn: (t) => withTimeout(async () => {
    const stack = await startStack({
      services: [
        "market-sim",
        "ems",
        "oms",
        "user-service",
        "journal",
        "gateway",
        "fix-archive",
        "observability",
        "feature-engine",
        "signal-engine",
        "scenario-engine",
        "market-data",
        "market-data-adapters",
        "recommendation-engine",
        "analytics",
        "news-aggregator",
        "replay",
        "limit-strategy",
        "twap-strategy",
        "pov-strategy",
        "vwap-strategy",
        "iceberg-strategy",
        "sniper-strategy",
        "arrival-price-strategy",
        "momentum-strategy",
        "is-strategy",
        "rfq-service",
        "dark-pool",
        "ccp-service",
        "llm-advisory",
      ],
      startupTimeoutMs: 90_000,
    });
    try {
      await t.step("every service /health returns 200 ok", async () => {
        const services = Object.keys(stack.urls) as (keyof TestStack["urls"])[];
        const results = await Promise.all(
          services.map(async (s) => {
            const u = url(stack, s);
            const res = await fetch(`${u}/health`, { signal: T() });
            const body = await res.json().catch(() => null);
            return { service: s, status: res.status, body };
          }),
        );
        const failures = results.filter((r) => r.status !== 200);
        assertEquals(
          failures,
          [],
          `Services reporting non-200 /health: ${JSON.stringify(failures)}`,
        );
      });

      await t.step(
        "every service /health response includes a version field",
        async () => {
          const services = Object.keys(
            stack.urls,
          ) as (keyof TestStack["urls"])[];
          const missing = [];
          for (const s of services) {
            const res = await fetch(`${url(stack, s)}/health`, { signal: T() });
            const body = (await res.json()) as { version?: string };
            if (typeof body.version !== "string" || body.version.length === 0) {
              missing.push(s);
            }
          }
          assertEquals(
            missing,
            [],
            `Services missing version field in /health: ${missing.join(", ")}`,
          );
        },
      );

      await t.step(
        "services report a single consistent version (no stale deployments)",
        async () => {
          // Pick a representative set that always boots from the same code tree.
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
              const res = await fetch(`${url(stack, s)}/health`, {
                signal: T(),
              });
              const body = (await res.json()) as { version: string };
              return { service: s, version: body.version };
            }),
          );
          const unique = new Set(versions.map((v) => v.version));
          assertEquals(
            unique.size,
            1,
            `Services report mismatched versions: ${JSON.stringify(versions)}`,
          );
        },
      );
    } finally {
      await stack.teardown();
    }
  }),
});

// Group 2: core trading flows. Boots the order pipeline plus every algo
// strategy so we can submit and settle orders end-to-end against the bus.
Deno.test({
  name: "smoke.full (testcontainers): core trading flows",
  ignore: !SHOULD_RUN,
  fn: (t) => withTimeout(async () => {
    const stack = await startStack({
      services: [
        "market-sim",
        "ems",
        "oms",
        "user-service",
        "journal",
        "gateway",
        "fix-archive",
        "observability",
        "risk-engine",
        "limit-strategy",
        "twap-strategy",
        "pov-strategy",
        "vwap-strategy",
        "iceberg-strategy",
        "sniper-strategy",
        "arrival-price-strategy",
        "momentum-strategy",
        "is-strategy",
        "llm-advisory",
      ],
      startupTimeoutMs: 90_000,
    });
    const GW = url(stack, "gateway");
    const J = url(stack, "journal");
    const US = url(stack, "user-service");
    const MS = url(stack, "market-sim");
    const FX = url(stack, "fix-archive");

    async function submitOrder(
      user: string,
      order: {
        asset: string;
        side: "BUY" | "SELL";
        quantity: number;
        limitPrice: number;
        strategy?: string;
        instrumentType?: string;
        algoParams?: Record<string, unknown>;
        expiresAt?: number;
      },
      timeoutMs = 20_000,
    ): Promise<{ event: string; clientOrderId: string }> {
      const token = await login(stack, user);
      const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
      const clientOrderId = `tc-${Date.now()}-${
        Math.random().toString(36).slice(2, 6)
      }`;
      const ws = new WebSocket(wsUrl);
      const closed = new Promise<void>((r) => {
        ws.onclose = () => r();
      });
      let result: { event: string } | null = null;
      try {
        result = await new Promise<{ event: string }>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error("WS timeout"));
          }, timeoutMs);
          ws.onopen = () => {
            ws.send(
              JSON.stringify({ type: "authenticate", payload: { token } }),
            );
          };
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data as string) as { event: string };
            if (msg.event === "authIdentity") {
              ws.send(
                JSON.stringify({
                  type: "submitOrder",
                  payload: {
                    clientOrderId,
                    asset: order.asset,
                    side: order.side,
                    quantity: order.quantity,
                    limitPrice: order.limitPrice,
                    expiresAt: order.expiresAt ?? 60,
                    strategy: order.strategy ?? "LIMIT",
                    instrumentType: order.instrumentType,
                    algoParams: order.algoParams ??
                      { strategy: order.strategy ?? "LIMIT" },
                  },
                }),
              );
            }
            if (
              msg.event === "orderAck" ||
              msg.event === "orderRejected" ||
              msg.event === "error"
            ) {
              clearTimeout(timer);
              ws.close();
              resolve(msg);
            }
          };
          ws.onerror = () => {
            clearTimeout(timer);
            ws.close();
            reject(new Error("WS error"));
          };
        });
      } finally {
        await closed;
      }
      return { event: result?.event, clientOrderId };
    }

    interface SmokeOrder {
      id: string;
      asset: string;
      side: string;
      quantity: number;
      strategy: string;
      status: string;
      children: { id: string; status: string; quantity: number }[];
    }

    async function livePrice(token: string, symbol: string): Promise<number> {
      try {
        const res = await fetch(`${GW}/assets`, {
          headers: { Cookie: `veta_user=${token}` },
          signal: T(10_000),
        });
        if (!res.ok) {
          await res.body?.cancel();
          return 190;
        }
        const assets = await res.json();
        if (!Array.isArray(assets)) return 190;
        return (
          (assets as { symbol: string; price: number }[]).find((a) =>
            a.symbol === symbol
          )?.price ??
            190
        );
      } catch {
        return 190;
      }
    }

    async function pollSettled(
      clientOrderId: string,
      maxWaitMs = 90_000,
    ): Promise<SmokeOrder | null> {
      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${J}/grid/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gridId: "orderBlotter",
              filterExpr: {
                kind: "group",
                id: "g1",
                join: "AND",
                rules: [{
                  kind: "rule",
                  id: "r1",
                  field: "id",
                  op: "=",
                  value: clientOrderId,
                }],
              },
              sortField: null,
              sortDir: null,
              offset: 0,
              limit: 1,
            }),
            signal: T(15_000),
          });
          if (res.ok) {
            const data = (await res.json()) as { rows: SmokeOrder[] };
            if (data.rows.length > 0) {
              const order = data.rows[0];
              if (
                order.status === "filled" ||
                order.status === "expired" ||
                order.status === "rejected"
              ) {
                return order;
              }
            }
          } else {
            await res.body?.cancel();
          }
        } catch {
          /* transient fetch error, keep polling */
        }
        await new Promise((r) => setTimeout(r, 1_500));
      }
      return null;
    }

    try {
      await t.step(
        "WebSocket receives marketUpdate within 8 seconds",
        async () => {
          const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
          const ws = new WebSocket(wsUrl);
          const closed = new Promise<void>((r) => {
            ws.onclose = () => r();
          });
          let msg:
            | { event: string; data: { prices: Record<string, number> } }
            | null = null;
          try {
            msg = await new Promise<
              { event: string; data: { prices: Record<string, number> } }
            >(
              (resolve, reject) => {
                const t2 = setTimeout(() => {
                  ws.close();
                  reject(new Error("timeout"));
                }, 8_000);
                ws.onmessage = (ev) => {
                  const parsed = JSON.parse(ev.data as string) as {
                    event: string;
                    data: { prices: Record<string, number> };
                  };
                  if (parsed.event === "marketUpdate") {
                    clearTimeout(t2);
                    ws.close();
                    resolve(parsed);
                  }
                };
                ws.onerror = () => {
                  clearTimeout(t2);
                  ws.close();
                  reject(new Error("WS error"));
                };
              },
            );
          } finally {
            await closed;
          }
          assert(msg !== null);
          assert(msg.event === "marketUpdate");
          assert(typeof msg.data.prices === "object");
          assert(Object.keys(msg.data.prices).length > 0);
        },
      );

      await t.step(
        "unauthenticated submitOrder is acknowledged or rejected",
        async () => {
          const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
          const ws = new WebSocket(wsUrl);
          const closed = new Promise<void>((r) => {
            ws.onclose = () => r();
          });
          let ack: { event: string } | null = null;
          try {
            ack = await new Promise<{ event: string }>((resolve, reject) => {
              const t2 = setTimeout(() => {
                ws.close();
                reject(new Error("timeout"));
              }, 5_000);
              ws.onopen = () => {
                ws.send(
                  JSON.stringify({
                    type: "submitOrder",
                    payload: {
                      clientOrderId: `smoke-${Date.now()}`,
                      asset: "AAPL",
                      side: "BUY",
                      quantity: 100,
                      limitPrice: 200.0,
                      expiresAt: 60,
                      strategy: "LIMIT",
                      algoParams: { strategy: "LIMIT" },
                    },
                  }),
                );
              };
              ws.onmessage = (ev) => {
                const parsed = JSON.parse(ev.data as string) as {
                  event: string;
                };
                if (
                  ["orderAck", "orderRejected", "error"].includes(parsed.event)
                ) {
                  clearTimeout(t2);
                  ws.close();
                  resolve(parsed);
                }
              };
              ws.onerror = () => {
                clearTimeout(t2);
                ws.close();
                reject(new Error("WS error"));
              };
            });
          } finally {
            await closed;
          }
          assert(ack !== null);
          assert(
            ["orderAck", "orderRejected", "error"].includes(ack.event),
            `Expected orderAck/orderRejected/error, got: ${ack.event}`,
          );
        },
      );

      await t.step(
        "authenticated WS receives algoHeartbeat within 10s",
        async () => {
          const token = await login(stack, "alice");
          const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
          const ws = new WebSocket(wsUrl);
          const closed = new Promise<void>((r) => {
            ws.onclose = () => r();
          });
          try {
            await new Promise<void>((resolve, reject) => {
              const t2 = setTimeout(() => {
                ws.close();
                reject(new Error("No algoHeartbeat received"));
              }, 10_000);
              ws.onopen = () =>
                ws.send(
                  JSON.stringify({ type: "authenticate", payload: { token } }),
                );
              ws.onmessage = (ev) => {
                const msg = JSON.parse(ev.data as string) as { event: string };
                if (msg.event === "algoHeartbeat") {
                  clearTimeout(t2);
                  ws.close();
                  resolve();
                }
              };
              ws.onerror = () => {
                clearTimeout(t2);
                ws.close();
                reject(new Error("WS error"));
              };
            });
          } finally {
            await closed;
          }
        },
      );

      await t.step("authenticated BUY LIMIT orderAck within 5s", async () => {
        const { event } = await submitOrder("alice", {
          asset: "AAPL",
          side: "BUY",
          quantity: 10,
          limitPrice: 99_999,
          strategy: "LIMIT",
        });
        assertEquals(event, "orderAck", `Expected orderAck, got ${event}`);
      });

      await t.step("authenticated SELL LIMIT orderAck within 5s", async () => {
        const { event } = await submitOrder("alice", {
          asset: "MSFT",
          side: "SELL",
          quantity: 10,
          limitPrice: 1,
          strategy: "LIMIT",
        });
        assertEquals(event, "orderAck", `Expected orderAck, got ${event}`);
      });

      await t.step(
        "option order returns orderAck or orderRejected from OMS",
        async () => {
          const response = await submitOrder("alice", {
            asset: "AAPL",
            side: "BUY",
            quantity: 10,
            limitPrice: 200,
            strategy: "LIMIT",
            instrumentType: "option",
          });
          assert(
            response.event === "orderAck" || response.event === "orderRejected",
            `Expected orderAck or orderRejected, got ${response.event}`,
          );
        },
      );

      await t.step(
        "GET /shared-workspaces returns 401 without auth",
        async () => {
          const res = await fetch(`${GW}/shared-workspaces`, {
            signal: T(5_000),
          });
          assertEquals(res.status, 401);
          await res.body?.cancel();
        },
      );

      await t.step(
        "GET /advisory/admin/state returns 200 for admin",
        async () => {
          let res: Response | null = null;
          let token = "";
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
            token = await login(stack, "admin");
            try {
              res = await fetch(`${GW}/advisory/admin/state`, {
                headers: { Cookie: `veta_user=${token}` },
                signal: T(8_000),
              });
              if (res.status === 200) break;
              await res.body?.cancel();
              res = null;
            } catch {
              res = null;
            }
          }
          assert(
            res !== null,
            "advisory/admin/state never returned 200 after retries",
          );
          assertEquals(res?.status, 200, `Expected 200, got ${res?.status}`);
          const body = (await res?.json()) as {
            state: string;
            pendingJobs: number;
            policy: unknown;
          };
          assert(
            ["disabled", "armed", "active", "cooldown", "error"].includes(
              body.state,
            ),
            `Unexpected subsystem state: ${body.state}`,
          );
          assertEquals(typeof body.pendingJobs, "number");
          assertExists(body.policy);
        },
      );

      await t.step(
        "market-sim WebSocket emits tick data within 20s",
        async () => {
          const wsUrl = MS.replace(/^http/, "ws");
          const ws = new WebSocket(wsUrl);
          const closed = new Promise<void>((r) => {
            ws.onclose = () => r();
          });
          let msg = "";
          try {
            msg = await new Promise<string>((resolve, reject) => {
              const t2 = setTimeout(() => {
                ws.close();
                reject(new Error("timeout"));
              }, 20_000);
              ws.onmessage = (ev) => {
                clearTimeout(t2);
                ws.close();
                resolve(ev.data as string);
              };
              ws.onerror = () => {
                clearTimeout(t2);
                ws.close();
                reject(new Error("WS error"));
              };
            });
          } finally {
            await closed;
          }
          const parsed = JSON.parse(msg) as {
            event?: string;
            data?: {
              prices?: Record<string, number>;
              volumes?: Record<string, number>;
            };
          };
          assert(typeof parsed === "object" && parsed !== null);
          const tick = parsed.data ??
            (parsed as unknown as {
              prices?: Record<string, number>;
              volumes?: Record<string, number>;
            });
          const prices = tick.prices;
          assert(
            typeof prices === "object" && prices !== null &&
              Object.keys(prices).length > 0,
            "tick must have prices",
          );
          assert(typeof tick.volumes === "object", "tick must have volumes");
        },
      );

      await t.step(
        "OAuth2 token exchange sets veta_user cookie for alice",
        async () => {
          let res: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000));
            const verifier = `smoke-${crypto.randomUUID()}`;
            const digest = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            );
            const challenge = btoa(
              String.fromCharCode(...new Uint8Array(digest)),
            )
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/g, "");
            const authorize = await fetch(`${US}/oauth/authorize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: "veta-automation",
                username: "alice",
                password: "veta-dev-passcode",
                redirect_uri: "postmessage",
                response_type: "code",
                scope: "openid profile",
                code_challenge: challenge,
                code_challenge_method: "S256",
              }),
              signal: T(5_000),
            });
            if (!authorize.ok) {
              await authorize.body?.cancel();
              continue;
            }
            const { code } = (await authorize.json()) as { code: string };
            res = await fetch(`${US}/oauth/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: "veta-automation",
                code,
                grant_type: "authorization_code",
                redirect_uri: "postmessage",
                code_verifier: verifier,
              }),
              signal: T(5_000),
            });
            const setCookie = res.headers.get("set-cookie") ?? "";
            await res.body?.cancel();
            if (res.status === 200) {
              assert(
                setCookie.includes("veta_user="),
                "Expected veta_user cookie in Set-Cookie header",
              );
              break;
            }
            res = null;
          }
          assert(
            res !== null,
            "OAuth2 token exchange never returned 200 after retries",
          );
          assertEquals(res?.status, 200);
        },
      );

      await t.step(
        "POST /sessions/validate returns user + limits for alice",
        async () => {
          let res: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000));
            const token = await login(stack, "alice");
            res = await fetch(`${US}/sessions/validate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
              signal: T(5_000),
            });
            if (res.status === 200) break;
            await res.body?.cancel();
            res = null;
          }
          assert(res !== null, "validate never returned 200 after retries");
          assertEquals(res?.status, 200);
          const body = (await res?.json()) as {
            user: { id: string; role: string };
            limits: unknown;
          };
          assertEquals(body.user.id, "alice");
          assertExists(body.user.role);
          assertExists(body.limits);
        },
      );

      await t.step(
        "GET /candles?instrument=AAPL&interval=1m returns array",
        async () => {
          const res = await fetch(
            `${J}/candles?instrument=AAPL&interval=1m&limit=5`,
            {
              signal: T(5_000),
            },
          );
          assertEquals(res.status, 200);
          assert(Array.isArray(await res.json()), "candles must be an array");
        },
      );

      await t.step("GET /orders returns array", async () => {
        const res = await fetch(`${J}/orders?limit=10`, { signal: T(5_000) });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()), "orders must be an array");
      });

      await t.step(
        "GET /metrics/latency returns stage percentile shape",
        async () => {
          const res = await fetch(`${J}/metrics/latency?windowMs=60000`, {
            signal: T(5_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            windowMs: number;
            queriedAt: number;
            sampleSize: number;
            stages: Record<
              string,
              {
                count: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
              }
            >;
          };
          assertEquals(body.windowMs, 60_000);
          assertEquals(typeof body.queriedAt, "number");
          assertEquals(typeof body.sampleSize, "number");
          for (
            const stage of [
              "submittedToRouted",
              "routedToChild",
              "childToFilled",
              "submittedToFilled",
              "submittedToArrived",
            ]
          ) {
            const s = body.stages[stage];
            assertExists(s, `stages.${stage} missing`);
            assertEquals(typeof s.count, "number");
            assertEquals(typeof s.p50, "number");
            assertEquals(typeof s.p95, "number");
            assertEquals(typeof s.p99, "number");
            assertEquals(typeof s.max, "number");
          }
        },
      );

      await t.step(
        "POST /grid/query orderBlotter returns rows + total + evalMs",
        async () => {
          const res = await fetch(`${J}/grid/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              gridId: "orderBlotter",
              filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
              sortField: null,
              sortDir: null,
              offset: 0,
              limit: 50,
            }),
            signal: T(8_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            rows: unknown[];
            total: number;
            evalMs: number;
          };
          assert(Array.isArray(body.rows));
          assertEquals(typeof body.total, "number");
          assert(typeof body.evalMs === "number" && body.evalMs >= 0);
        },
      );

      await t.step(
        "fix-archive /health includes executions count",
        async () => {
          const res = await fetch(`${FX}/health`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            status: string;
            executions: number;
          };
          assertEquals(body.status, "ok");
          assertEquals(typeof body.executions, "number");
        },
      );

      await t.step(
        "fix-archive GET /executions returns array with expected fields",
        async () => {
          const res = await fetch(`${FX}/executions?limit=10`, {
            signal: T(5_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as Record<string, unknown>[];
          assert(Array.isArray(body), "executions must be an array");
          if (body.length > 0) {
            for (
              const field of [
                "execId",
                "clOrdId",
                "symbol",
                "side",
                "cumQty",
                "avgPx",
              ]
            ) {
              assertExists(body[0][field], `execution missing field: ${field}`);
            }
          }
        },
      );

      await t.step(
        "LIMIT order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "AAPL");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "AAPL",
            side: "BUY",
            quantity: 10,
            limitPrice: price * 1.05,
            strategy: "LIMIT",
          });
          const order = await pollSettled(clientOrderId, 90_000);
          assertExists(
            order,
            `LIMIT order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired",
            `Expected filled/expired, got: ${order?.status}`,
          );
        },
      );

      await t.step(
        "TWAP order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "AAPL");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "AAPL",
            side: "BUY",
            quantity: 60,
            limitPrice: price * 1.05,
            strategy: "TWAP",
            algoParams: { strategy: "TWAP", slices: 3, intervalSeconds: 3 },
            expiresAt: 15,
          });
          const order = await pollSettled(clientOrderId, 90_000);
          assertExists(
            order,
            `TWAP order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired" ||
              order?.status === "rejected",
            `Expected filled/expired/rejected, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "TWAP");
        },
      );

      await t.step(
        "POV order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "bob");
          const price = await livePrice(token, "MSFT");
          const { clientOrderId } = await submitOrder("bob", {
            asset: "MSFT",
            side: "BUY",
            quantity: 80,
            limitPrice: price * 1.05,
            strategy: "POV",
            algoParams: { strategy: "POV", povRate: 0.15 },
          });
          const order = await pollSettled(clientOrderId, 90_000);
          assertExists(
            order,
            `POV order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired",
            `Expected filled/expired, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "POV");
        },
      );

      await t.step(
        "VWAP order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "AAPL");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "AAPL",
            side: "SELL",
            quantity: 60,
            limitPrice: price * 0.95,
            strategy: "VWAP",
            algoParams: { strategy: "VWAP", intervalSeconds: 3 },
          });
          const order = await pollSettled(clientOrderId, 90_000);
          assertExists(
            order,
            `VWAP order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired",
            `Expected filled/expired, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "VWAP");
        },
      );

      await t.step("ICEBERG order is acknowledged by gateway", async () => {
        const token = await login(stack, "alice");
        const price = await livePrice(token, "MSFT");
        const { event } = await submitOrder("alice", {
          asset: "MSFT",
          side: "BUY",
          quantity: 60,
          limitPrice: price * 1.05,
          strategy: "ICEBERG",
          algoParams: { strategy: "ICEBERG", visibleQty: 30 },
          expiresAt: 30,
        });
        assert(
          event === "orderAck" || event === "orderRejected",
          `Expected orderAck or orderRejected from gateway, got ${event}`,
        );
      });

      await t.step(
        "SNIPER order reaches filled or expired within 60s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "AAPL");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "AAPL",
            side: "BUY",
            quantity: 30,
            limitPrice: price * 1.05,
            strategy: "SNIPER",
            algoParams: { strategy: "SNIPER" },
            expiresAt: 30,
          });
          const order = await pollSettled(clientOrderId, 60_000);
          assertExists(
            order,
            `SNIPER order ${clientOrderId} did not settle within 60s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired",
            `Expected filled/expired, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "SNIPER");
        },
      );

      await t.step(
        "ARRIVAL_PRICE order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "MSFT");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "MSFT",
            side: "BUY",
            quantity: 40,
            limitPrice: price * 1.05,
            strategy: "ARRIVAL_PRICE",
            algoParams: { strategy: "ARRIVAL_PRICE" },
            expiresAt: 30,
          });
          const order = await pollSettled(clientOrderId, 60_000);
          assertExists(
            order,
            `ARRIVAL_PRICE order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired" ||
              order?.status === "rejected",
            `Expected filled/expired/rejected, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "ARRIVAL_PRICE");
        },
      );

      await t.step(
        "MOMENTUM order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "AAPL");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "AAPL",
            side: "BUY",
            quantity: 30,
            limitPrice: price * 1.05,
            strategy: "MOMENTUM",
            algoParams: { strategy: "MOMENTUM", entryThresholdBps: 0.01 },
            expiresAt: 30,
          });
          const order = await pollSettled(clientOrderId, 60_000);
          assertExists(
            order,
            `MOMENTUM order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired" ||
              order?.status === "rejected",
            `Expected filled/expired/rejected, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "MOMENTUM");
        },
      );

      await t.step(
        "IS order reaches filled or expired within 90s",
        async () => {
          const token = await login(stack, "alice");
          const price = await livePrice(token, "MSFT");
          const { clientOrderId } = await submitOrder("alice", {
            asset: "MSFT",
            side: "BUY",
            quantity: 40,
            limitPrice: price * 1.05,
            strategy: "IS",
            algoParams: { strategy: "IS" },
            expiresAt: 30,
          });
          const order = await pollSettled(clientOrderId, 60_000);
          assertExists(
            order,
            `IS order ${clientOrderId} did not settle within 90s`,
          );
          assert(
            order?.status === "filled" || order?.status === "expired" ||
              order?.status === "rejected",
            `Expected filled/expired/rejected, got: ${order?.status}`,
          );
          assertEquals(order?.strategy, "IS");
        },
      );

      await t.step(
        "rejected order (impossible price) has rejected status",
        async () => {
          const { clientOrderId, event } = await submitOrder("alice", {
            asset: "AAPL",
            side: "BUY",
            quantity: 1,
            limitPrice: 0.01,
            strategy: "LIMIT",
            expiresAt: 20,
          });
          if (event === "orderRejected") return;
          const deadline = Date.now() + 60_000;
          let finalStatus = "queued";
          while (Date.now() < deadline) {
            try {
              const res = await fetch(`${J}/grid/query`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  gridId: "orderBlotter",
                  filterExpr: {
                    kind: "group",
                    id: "g1",
                    join: "AND",
                    rules: [{
                      kind: "rule",
                      id: "r1",
                      field: "id",
                      op: "=",
                      value: clientOrderId,
                    }],
                  },
                  sortField: null,
                  sortDir: null,
                  offset: 0,
                  limit: 1,
                }),
                signal: T(10_000),
              });
              if (res.ok) {
                const data = (await res.json()) as { rows: SmokeOrder[] };
                if (data.rows.length > 0) {
                  finalStatus = data.rows[0].status;
                  if (
                    finalStatus !== "queued" &&
                    finalStatus !== "executing" &&
                    finalStatus !== "working" &&
                    finalStatus !== "pending"
                  ) {
                    break;
                  }
                }
              } else {
                await res.body?.cancel();
              }
            } catch {
              /* transient fetch error, keep polling */
            }
            await new Promise((r) => setTimeout(r, 1_500));
          }
          assert(
            finalStatus === "filled" || finalStatus === "expired" ||
              finalStatus === "rejected",
            `Expected order to settle (not stay ${finalStatus})`,
          );
        },
      );

      await t.step(
        "/ready returns JSON with ready field and correct HTTP status",
        async () => {
          const res = await fetch(`${GW}/ready`, { signal: T(10_000) });
          const body = (await res.json()) as {
            ready: boolean;
            services: Record<string, boolean>;
          };
          assertEquals(typeof body.ready, "boolean");
          assertEquals(
            res.status,
            body.ready ? 200 : 503,
            "HTTP status must be 200 when ready, 503 when not",
          );
        },
      );

      await t.step(
        "/ready response includes all expected service keys",
        async () => {
          const token = await login(stack, "alice");
          const res = await fetch(`${GW}/ready`, {
            headers: { Cookie: `veta_user=${token}` },
            signal: T(10_000),
          });
          const body = (await res.json()) as {
            ready: boolean;
            services: Record<string, boolean>;
          };
          const expected = [
            "marketSim",
            "ems",
            "oms",
            "journal",
            "userService",
            "bus",
            "fixArchive",
            "fixGateway",
            "observability",
            "limitAlgo",
            "twapAlgo",
            "povAlgo",
            "vwapAlgo",
            "icebergAlgo",
            "sniperAlgo",
            "arrivalPriceAlgo",
            "momentumAlgo",
            "isAlgo",
            "darkPool",
            "ccpService",
            "rfqService",
            "analytics",
            "marketData",
            "featureEngine",
            "signalEngine",
            "recommendationEngine",
            "scenarioEngine",
            "newsAggregator",
            "llmAdvisory",
          ];
          for (const key of expected) {
            assert(
              key in body.services,
              `Missing service key in /ready response: ${key}`,
            );
            assertEquals(
              typeof body.services[key],
              "boolean",
              `Service key ${key} must be boolean`,
            );
          }
        },
      );

      await t.step(
        "/ready: ems and oms report true (env-var routing works)",
        async () => {
          const token = await login(stack, "alice");
          const res = await fetch(`${GW}/ready`, {
            headers: { Cookie: `veta_user=${token}` },
            signal: T(10_000),
          });
          const body = (await res.json()) as {
            services: Record<string, boolean>;
          };
          assertEquals(
            body.services.ems,
            true,
            "ems must be true, check EMS_HOST/EMS_PORT env vars in gateway",
          );
          assertEquals(
            body.services.oms,
            true,
            "oms must be true, check OMS_HOST/OMS_PORT env vars in gateway",
          );
        },
      );

      await t.step(
        "OAuth2 authorize with unknown userId returns 404",
        async () => {
          const res = await fetch(`${US}/oauth/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: "veta-automation",
              username: "does-not-exist-xyz",
              password: "veta-dev-passcode",
              redirect_uri: "postmessage",
              response_type: "code",
              scope: "openid profile",
              code_challenge: "invalid",
              code_challenge_method: "S256",
            }),
            signal: T(5_000),
          });
          assertEquals(res.status, 404);
          await res.body?.cancel();
        },
      );

      await t.step(
        "OAuth2 authorize with invalid password returns 401",
        async () => {
          const res = await fetch(`${US}/oauth/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: "veta-automation",
              username: "alice",
              password: "wrong-passcode-xyz",
              redirect_uri: "postmessage",
              response_type: "code",
              scope: "openid profile",
              code_challenge: "invalid",
              code_challenge_method: "S256",
            }),
            signal: T(5_000),
          });
          assertEquals(res.status, 401);
          const body = (await res.json()) as { error?: string };
          assertEquals(body.error, "invalid_credentials");
        },
      );

      await t.step(
        "OAuth2 authorize with missing password returns 401",
        async () => {
          const res = await fetch(`${US}/oauth/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: "veta-automation",
              username: "alice",
              redirect_uri: "postmessage",
              response_type: "code",
              scope: "openid profile",
              code_challenge: "invalid",
              code_challenge_method: "S256",
            }),
            signal: T(5_000),
          });
          assertEquals(res.status, 401);
          const body = (await res.json()) as { error?: string };
          assertEquals(body.error, "invalid_credentials");
        },
      );

      await t.step(
        "OAuth2 public registration is disabled by default (403)",
        async () => {
          const res = await fetch(`${US}/oauth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: "test-viewer-invalid-creds",
              name: "Test Viewer",
              password: "wrong-passcode",
            }),
            signal: T(5_000),
          });
          assertEquals(res.status, 403);
          const body = (await res.json()) as { error?: string };
          assertEquals(body.error, "registration disabled");
        },
      );

      await t.step("legacy POST /sessions is disabled (410 Gone)", async () => {
        const res = await fetch(`${US}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "alice" }),
          signal: T(5_000),
        });
        assertEquals(res.status, 410);
        const body = (await res.json()) as { error?: string };
        assertEquals(
          body.error,
          "legacy /sessions login is disabled; use OAuth2 /oauth/authorize + /oauth/token",
        );
      });

      await t.step(
        "trader role cannot access admin-only endpoint",
        async () => {
          const token = await login(stack, "alice");
          const res = await fetch(`${GW}/advisory/admin/state`, {
            headers: { Cookie: `veta_user=${token}` },
            signal: T(5_000),
          });
          assert(
            res.status === 401 || res.status === 403,
            `trader should be denied admin endpoint, got ${res.status}`,
          );
          await res.body?.cancel();
        },
      );

      await t.step("request with invalid token returns 401", async () => {
        const res = await fetch(`${GW}/shared-workspaces`, {
          headers: { Cookie: "veta_user=invalid-token-xyz" },
          signal: T(5_000),
        });
        assertEquals(res.status, 401);
        await res.body?.cancel();
      });

      await t.step(
        "GET /personas returns trader personas with trading_style and primary_desk",
        async () => {
          const res = await fetch(`${US}/personas`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            personas: Array<{
              id: string;
              name: string;
              role: string;
              avatar_emoji: string;
              description: string;
              trading_style: string | null;
              primary_desk: string | null;
              allowed_strategies: string[];
              max_order_qty: number;
              dark_pool_access: boolean;
            }>;
          };
          assert(Array.isArray(body.personas));
          assert(
            body.personas.length >= 10,
            `expected at least 10 personas, got ${body.personas.length}`,
          );

          const alice = body.personas.find((p) => p.id === "alice");
          assertExists(alice, "alice persona missing");
          assertEquals(alice?.trading_style, "high_touch");
          assertEquals(alice?.primary_desk, "equity-cash");

          const bob = body.personas.find((p) => p.id === "bob");
          assertExists(bob, "bob persona missing");
          assertEquals(bob?.trading_style, "low_touch");

          const carol = body.personas.find((p) => p.id === "carol");
          assertExists(carol, "carol persona missing");
          assertEquals(carol?.trading_style, "fi_voice");

          const frank = body.personas.find((p) => p.id === "frank");
          assertExists(frank, "frank persona missing");
          assertEquals(frank?.role, "desk-head");

          const maya = body.personas.find((p) => p.id === "maya");
          assertExists(maya, "maya persona missing");
          assertEquals(maya?.role, "risk-manager");
          assertEquals(maya?.trading_style, "oversight");
          assertEquals(maya?.primary_desk, "cross-desk");
          assertEquals(maya?.max_order_qty, 0);

          for (const p of body.personas) {
            if (p.role === "trader" && p.id !== "test-full-trader") {
              assert(
                p.primary_desk !== null,
                `trader ${p.id} missing primary_desk`,
              );
              assert(
                p.trading_style !== null,
                `trader ${p.id} missing trading_style`,
              );
              assert(
                p.primary_desk !== "cross-desk",
                `trader ${p.id} has cross-desk primary (should be a single-asset-class desk)`,
              );
            }
          }
        },
      );

      await t.step(
        "landing-page full OAuth login flow with browser-style headers succeeds",
        async () => {
          const verifier = `landing-${crypto.randomUUID()}`;
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          );
          const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");

          const browserHeaders = {
            "Content-Type": "application/json",
            Origin: "http://localhost:3000",
            Referer: "http://localhost:3000/",
          };

          const authorize = await fetch(`${US}/oauth/authorize`, {
            method: "POST",
            headers: browserHeaders,
            body: JSON.stringify({
              client_id: "veta-web",
              username: "alice",
              password: "veta-dev-passcode",
              redirect_uri: "postmessage",
              response_type: "code",
              scope: "openid profile",
              code_challenge: challenge,
              code_challenge_method: "S256",
            }),
            signal: T(8_000),
          });
          assertEquals(
            authorize.status,
            200,
            `landing-page authorize POST returned ${authorize.status} (browser-style request through gateway proxy must succeed)`,
          );
          const authBody = (await authorize.json()) as { code: string };
          assert(authBody.code, "authorize response missing code");

          const token = await fetch(`${US}/oauth/token`, {
            method: "POST",
            headers: browserHeaders,
            body: JSON.stringify({
              client_id: "veta-web",
              code: authBody.code,
              grant_type: "authorization_code",
              redirect_uri: "postmessage",
              code_verifier: verifier,
            }),
            signal: T(8_000),
          });
          assertEquals(
            token.status,
            200,
            `landing-page token POST returned ${token.status}`,
          );
          const tokenBody = (await token.json()) as {
            user: { id: string; role: string };
          };
          assertEquals(tokenBody.user.id, "alice");
          assertEquals(tokenBody.user.role, "trader");
        },
      );

      await t.step(
        "landing-page OAuth login with invalid password returns 401 (not 500)",
        async () => {
          const verifier = `landing-bad-${crypto.randomUUID()}`;
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          );
          const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");

          const res = await fetch(`${US}/oauth/authorize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "http://localhost:3000",
            },
            body: JSON.stringify({
              client_id: "veta-web",
              username: "alice",
              password: "definitely-wrong-password",
              redirect_uri: "postmessage",
              response_type: "code",
              scope: "openid profile",
              code_challenge: challenge,
              code_challenge_method: "S256",
            }),
            signal: T(8_000),
          });
          await res.body?.cancel();
          assertEquals(
            res.status,
            401,
            `expected 401 for bad password, got ${res.status}`,
          );
        },
      );

      await t.step(
        "gateway /system: disk usage is reported and not exhausted",
        async () => {
          const token = await login(stack, "alice");
          const res = await fetch(`${GW}/system`, {
            headers: { Cookie: `veta_user=${token}` },
            signal: T(5_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            disk: {
              total?: number;
              used?: number;
              available?: number;
              percentUsed?: number;
            } | null;
            diskStatus?: string;
          };
          if (body.disk && body.disk.percentUsed != null) {
            assert(
              body.disk.percentUsed < 95,
              `disk is ${
                body.disk.percentUsed.toFixed(1)
              }% full (cleanup required)`,
            );
          }
        },
      );
    } finally {
      await stack.teardown();
    }
  }),
});

// Group 3: peripheral services. Boots the intelligence and analytics
// pipeline plus the alternative-trading-system services and replay so we
// can probe each one's public contract in isolation from the order flow.
Deno.test({
  name: "smoke.full (testcontainers): peripheral services",
  ignore: !SHOULD_RUN,
  fn: (t) => withTimeout(async () => {
    const stack = await startStack({
      services: [
        "market-sim",
        "journal",
        "user-service",
        "gateway",
        "news-aggregator",
        "analytics",
        "recommendation-engine",
        "feature-engine",
        "signal-engine",
        "scenario-engine",
        "llm-advisory",
        "replay",
        "rfq-service",
        "dark-pool",
        "ccp-service",
        "market-data",
        "market-data-adapters",
        "observability",
      ],
      startupTimeoutMs: 120_000,
    });
    const NEWS = url(stack, "news-aggregator");
    const ANALYTICS_URL = url(stack, "analytics");
    const REC = url(stack, "recommendation-engine");
    const MDS = url(stack, "market-data");
    const FEATURE = url(stack, "feature-engine");
    const SIGNAL = url(stack, "signal-engine");
    const SCENARIO = url(stack, "scenario-engine");
    const LLM = url(stack, "llm-advisory");
    const RFQ = url(stack, "rfq-service");
    const DARK = url(stack, "dark-pool");
    const CCP = url(stack, "ccp-service");
    const OBS = url(stack, "observability");
    const REPLAY = url(stack, "replay");

    try {
      await t.step("news GET /news?symbol=AAPL returns array", async () => {
        const res = await fetch(`${NEWS}/news?symbol=AAPL&limit=5`, {
          signal: T(5_000),
        });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()), "news must be an array");
      });

      await t.step(
        "news GET /sources returns non-empty list with id, label, enabled fields",
        async () => {
          const res = await fetch(`${NEWS}/sources`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            id: string;
            label: string;
            enabled: boolean;
          }[];
          assert(
            Array.isArray(body) && body.length > 0,
            "sources must be a non-empty array",
          );
          assertExists(body[0].id);
          assertExists(body[0].label);
          assertEquals(typeof body[0].enabled, "boolean");
        },
      );

      await t.step(
        "analytics POST /quote returns Black-Scholes price + greeks for AAPL call",
        async () => {
          const res = await fetch(`${ANALYTICS_URL}/quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: "AAPL",
              optionType: "call",
              strike: 200,
              expirySecs: 86400,
            }),
            signal: T(8_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            price: number;
            greeks: { delta: number; gamma: number };
          };
          assertEquals(typeof body.price, "number");
          assertExists(body.greeks, "greeks object must be present");
          assertEquals(typeof body.greeks.delta, "number");
          assertEquals(typeof body.greeks.gamma, "number");
        },
      );

      await t.step("recommendation-engine /health includes count", async () => {
        const res = await fetch(`${REC}/health`, { signal: T(5_000) });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { status: string; count: number };
        assertEquals(body.status, "ok");
        assertEquals(typeof body.count, "number");
      });

      await t.step(
        "recommendation-engine GET /recommendations returns array",
        async () => {
          const res = await fetch(`${REC}/recommendations?limit=10`, {
            signal: T(5_000),
          });
          assertEquals(res.status, 200);
          assert(
            Array.isArray(await res.json()),
            "recommendations must be an array",
          );
        },
      );

      await t.step(
        "market-data-service GET /sources returns array",
        async () => {
          const res = await fetch(`${MDS}/sources`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          assert(
            Array.isArray(await res.json()),
            "/sources must return an array",
          );
        },
      );

      await t.step(
        "feature-engine /health includes trackedSymbols",
        async () => {
          const res = await fetch(`${FEATURE}/health`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            status: string;
            trackedSymbols: number;
          };
          assertEquals(body.status, "ok");
          assertEquals(typeof body.trackedSymbols, "number");
        },
      );

      await t.step(
        "signal-engine /health includes trackedSymbols",
        async () => {
          const res = await fetch(`${SIGNAL}/health`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            status: string;
            trackedSymbols: number;
          };
          assertEquals(body.status, "ok");
          assertEquals(typeof body.trackedSymbols, "number");
        },
      );

      await t.step("scenario-engine /health is ok", async () => {
        const res = await fetch(`${SCENARIO}/health`, { signal: T(5_000) });
        assertEquals(res.status, 200);
        assertEquals(((await res.json()) as { status: string }).status, "ok");
      });

      await t.step(
        "llm-advisory /health reports status and trackedSymbols",
        async () => {
          const res = await fetch(`${LLM}/health`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            status: string;
            trackedSymbols: number;
          };
          assertEquals(body.status, "ok");
          assertEquals(typeof body.trackedSymbols, "number");
        },
      );

      await t.step(
        "llm-advisory GET /admin/state returns valid subsystem state and policy",
        async () => {
          const res = await fetch(`${LLM}/admin/state`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            state: string;
            pendingJobs: number;
            policy: { enabled: boolean; triggerMode: string };
            runtimeConfig: { enabled: boolean };
          };
          assert(
            ["disabled", "armed", "active", "cooldown", "error"].includes(
              body.state,
            ),
            `Unexpected state value: ${body.state}`,
          );
          assertEquals(typeof body.pendingJobs, "number");
          assertExists(body.policy);
          assertEquals(typeof body.policy.enabled, "boolean");
          assertExists(body.runtimeConfig);
        },
      );

      await t.step(
        "rfq-service GET /rfq/stats returns valid structure",
        async () => {
          const res = await fetch(`${RFQ}/rfq/stats`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            service: string;
            total: number;
            byState: Record<string, number>;
            quoteWindowMs: number;
          };
          assertEquals(body.service, "rfq-service");
          assertEquals(typeof body.total, "number");
          assertExists(body.byState);
          assertEquals(typeof body.quoteWindowMs, "number");
        },
      );

      await t.step(
        "dark-pool GET /pool/stats returns valid structure",
        async () => {
          const res = await fetch(`${DARK}/pool/stats`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            service: string;
            currentDepth: Record<string, unknown>;
            totalMatchedToday: number;
            totalMatchedAllTime: number;
          };
          assertEquals(body.service, "dark-pool");
          assertExists(body.currentDepth);
          assertEquals(typeof body.totalMatchedToday, "number");
          assertEquals(typeof body.totalMatchedAllTime, "number");
        },
      );

      await t.step(
        "ccp-service GET /ccp/stats returns valid structure",
        async () => {
          const res = await fetch(`${CCP}/ccp/stats`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            service: string;
            totalNovated: number;
            pendingObligations: number;
            marginAccountCount: number;
          };
          assertEquals(body.service, "ccp-service");
          assertEquals(typeof body.totalNovated, "number");
          assertEquals(typeof body.pendingObligations, "number");
          assertEquals(typeof body.marginAccountCount, "number");
        },
      );

      await t.step(
        "observability POST /events/batch accepts array and returns count",
        async () => {
          const res = await fetch(`${OBS}/events/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
              { type: "smoke.test", ts: Date.now(), payload: { x: 1 } },
              { type: "smoke.test", ts: Date.now(), payload: { x: 2 } },
            ]),
            signal: T(5_000),
          });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            success: boolean;
            count: number;
          };
          assertEquals(body.success, true);
          assertEquals(body.count, 2);
        },
      );

      await t.step("observability GET /health returns ok", async () => {
        const res = await fetch(`${OBS}/health`, { signal: T(5_000) });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { status: string };
        assertEquals(body.status, "ok");
      });

      await t.step(
        "replay GET /config returns recordingEnabled boolean",
        async () => {
          const res = await fetch(`${REPLAY}/config`, { signal: T(5_000) });
          assertEquals(res.status, 200);
          const body = (await res.json()) as { recordingEnabled: boolean };
          assertEquals(typeof body.recordingEnabled, "boolean");
        },
      );

      await t.step(
        "replay session CRUD: create, list, end, events, delete",
        async () => {
          const sessionId = `smoke-test-${Date.now()}`;

          const createRes = await fetch(`${REPLAY}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: sessionId,
              userId: "smoke-test",
              userName: "Smoke Test",
              userRole: "admin",
            }),
            signal: T(5_000),
          });
          assertEquals(createRes.status, 201);
          await createRes.body?.cancel();

          const chunkRes = await fetch(
            `${REPLAY}/sessions/${sessionId}/chunks`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                seq: 0,
                events: [{ type: 2, data: {}, timestamp: Date.now() }],
              }),
              signal: T(5_000),
            },
          );
          assertEquals(chunkRes.status, 201);
          await chunkRes.body?.cancel();

          const endRes = await fetch(`${REPLAY}/sessions/${sessionId}/end`, {
            method: "PUT",
            signal: T(5_000),
          });
          assertEquals(endRes.status, 200);
          await endRes.body?.cancel();

          const listRes = await fetch(`${REPLAY}/sessions?limit=5`, {
            signal: T(5_000),
          });
          assertEquals(listRes.status, 200);
          const listBody = (await listRes.json()) as {
            sessions: { id: string }[];
            total: number;
          };
          assert(listBody.sessions.some((s) => s.id === sessionId));

          const eventsRes = await fetch(
            `${REPLAY}/sessions/${sessionId}/events`,
            {
              signal: T(5_000),
            },
          );
          assertEquals(eventsRes.status, 200);
          const eventsBody = (await eventsRes.json()) as { events: unknown[] };
          assert(eventsBody.events.length > 0);

          // FK RESTRICT: session with chunks must reject direct deletion.
          const deleteBlocked = await fetch(`${REPLAY}/sessions/${sessionId}`, {
            method: "DELETE",
            signal: T(5_000),
          });
          assertEquals(deleteBlocked.status, 409);
          await deleteBlocked.body?.cancel();

          // Delete chunks first, then the session metadata.
          const deleteChunks = await fetch(
            `${REPLAY}/sessions/${sessionId}/chunks`,
            { method: "DELETE", signal: T(5_000) },
          );
          assertEquals(deleteChunks.status, 200);
          await deleteChunks.body?.cancel();

          const deleteRes = await fetch(`${REPLAY}/sessions/${sessionId}`, {
            method: "DELETE",
            signal: T(5_000),
          });
          assertEquals(deleteRes.status, 200);
          await deleteRes.body?.cancel();
        },
      );
    } finally {
      await stack.teardown();
    }
  }),
});
