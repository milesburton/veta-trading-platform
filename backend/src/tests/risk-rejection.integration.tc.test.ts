import { assert, assertEquals } from "jsr:@std/assert@0.217";
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
  name: "risk-engine pre-trade rejection (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: [...SERVICES],
      perServiceEnv: { oms: { RISK_ENGINE_ENABLED: "true" } },
      startupTimeoutMs: 90_000,
    });
    const GW = url(stack, "gateway");
    const MS = url(stack, "market-sim");

    async function midPrice(symbol: string): Promise<number> {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const res = await fetch(`${MS}/prices`, { signal: T() });
        const prices = (await res.json()) as Record<string, number>;
        const px = prices[symbol];
        if (px && px > 0) return px;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`no live price for ${symbol} within 20s`);
    }

    async function submitAndWatch(
      user: string,
      order: {
        asset: string;
        side: "BUY" | "SELL";
        quantity: number;
        limitPrice: number;
      },
      watchMs = 20_000
    ): Promise<{ acked: boolean; rejected: boolean; rejectReason?: string }> {
      const token = await login(stack, user);
      const wsUrl = `${GW.replace(/^http/, "ws")}/ws`;
      const clientOrderId = `risk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const ws = new WebSocket(wsUrl);
      const closed = new Promise<void>((r) => {
        ws.onclose = () => r();
      });
      const outcome = {
        acked: false,
        rejected: false,
        rejectReason: undefined as string | undefined,
      };
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            ws.close();
            resolve();
          }, watchMs);
          ws.onopen = () => {
            ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
          };
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data as string) as {
              event: string;
              topic?: string;
              data?: { reason?: string; clientOrderId?: string };
            };
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
                    expiresAt: 60,
                    strategy: "LIMIT",
                    algoParams: { strategy: "LIMIT" },
                  },
                })
              );
            }
            if (msg.event === "orderAck") outcome.acked = true;
            const isRejectEvent =
              msg.event === "orderRejected" ||
              (msg.event === "orderEvent" && msg.topic === "orders.rejected");
            if (isRejectEvent && (msg.data?.clientOrderId ?? clientOrderId) === clientOrderId) {
              outcome.rejected = true;
              outcome.rejectReason = msg.data?.reason;
              clearTimeout(timer);
              ws.close();
              resolve();
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
      return outcome;
    }

    try {
      await t.step("risk-engine /health is ok with pre-trade checks enabled", async () => {
        const res = await fetch(`${url(stack, "risk-engine")}/health`, {
          signal: T(),
        });
        assertEquals(res.status, 200);
        assertEquals(((await res.json()) as { status: string }).status, "ok");
      });

      await t.step("risk-engine /check rejects a fat-finger limit price", async () => {
        const mid = await midPrice("AAPL");
        const res = await fetch(`${url(stack, "risk-engine")}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: "direct-fatfinger",
            userId: "alice",
            userRole: "trader",
            symbol: "AAPL",
            side: "BUY",
            quantity: 10,
            limitPrice: mid * 2,
            strategy: "LIMIT",
          }),
          signal: T(),
        });
        assertEquals(res.status, 200);
        const result = (await res.json()) as {
          allowed: boolean;
          reasons: string[];
        };
        assertEquals(result.allowed, false);
        assert(
          result.reasons.some((r) => r.toLowerCase().includes("mid")),
          `expected a fat-finger reason, got: ${JSON.stringify(result.reasons)}`
        );
      });

      await t.step(
        "risk-engine /check does not flag an at-market price for fat-finger",
        async () => {
          const mid = await midPrice("AAPL");
          const res = await fetch(`${url(stack, "risk-engine")}/check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: "direct-ok",
              userId: "alice",
              userRole: "trader",
              symbol: "AAPL",
              side: "BUY",
              quantity: 10,
              limitPrice: mid,
              strategy: "LIMIT",
            }),
            signal: T(),
          });
          assertEquals(res.status, 200);
          const result = (await res.json()) as {
            allowed: boolean;
            reasons: string[];
          };
          assert(
            !result.reasons.some((r) => r.toLowerCase().includes("mid")),
            `at-market price should not trip the fat-finger check, reasons: ${JSON.stringify(
              result.reasons
            )}`
          );
        }
      );

      await t.step("OMS rejects a fat-finger order end-to-end", async () => {
        const mid = await midPrice("AAPL");
        const outcome = await submitAndWatch("alice", {
          asset: "AAPL",
          side: "BUY",
          quantity: 10,
          limitPrice: mid * 2,
        });
        assert(outcome.acked, "gateway should ack the submission before risk evaluates it");
        assert(
          outcome.rejected,
          `fat-finger order should be rejected by the risk-engine, outcome: ${JSON.stringify(
            outcome
          )}`
        );
      });

      await t.step("an at-market order is not rejected for fat-finger (control)", async () => {
        const mid = await midPrice("AAPL");
        const outcome = await submitAndWatch(
          "alice",
          { asset: "AAPL", side: "BUY", quantity: 10, limitPrice: mid },
          8000
        );
        assert(outcome.acked, "gateway should ack the at-market submission");
        assert(
          !(outcome.rejected && (outcome.rejectReason ?? "").toLowerCase().includes("mid")),
          `at-market order must not be fat-finger-rejected, reason: ${outcome.rejectReason}`
        );
      });
    } finally {
      await stack.teardown();
    }
  },
});
