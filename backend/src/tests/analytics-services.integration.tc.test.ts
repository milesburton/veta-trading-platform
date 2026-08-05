import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 8_000) => AbortSignal.timeout(ms);

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

const SERVICES = ["analytics", "news-aggregator", "recommendation-engine"] as const;

Deno.test({
  name: "analytics, news, recommendations HTTP behaviour (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: [...SERVICES],
      startupTimeoutMs: 45_000,
    });
    const AN = url(stack, "analytics");
    const NEWS = url(stack, "news-aggregator");
    const REC = url(stack, "recommendation-engine");

    try {
      await t.step("analytics POST /bond-price returns a coherent pricing result", async () => {
        const res = await fetch(`${AN}/bond-price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            couponRate: 0.05,
            totalPeriods: 10,
            yieldAnnual: 0.05,
            face: 1000,
            periodsPerYear: 2,
          }),
          signal: T(),
        });
        assertEquals(res.status, 200);
        const body = (await res.json()) as {
          price: number;
          modifiedDuration: number;
          dv01: number;
          cashFlows: unknown[];
        };
        assert(body.price > 0, "bond price should be positive");
        assert(body.modifiedDuration > 0, "modified duration should be positive");
        assert(body.dv01 > 0, "dv01 should be positive");
        assert(
          Array.isArray(body.cashFlows) && body.cashFlows.length === 10,
          "10 cash flows expected"
        );
        assert(
          body.price > 900 && body.price < 1050,
          `near-par bond should price close to face 1000, got ${body.price}`
        );
      });

      await t.step("analytics POST /bond-price prices a discount below a par bond", async () => {
        async function price(couponRate: number, yieldAnnual: number): Promise<number> {
          const res = await fetch(`${AN}/bond-price`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              couponRate,
              totalPeriods: 10,
              yieldAnnual,
              face: 1000,
            }),
            signal: T(),
          });
          assertEquals(res.status, 200);
          return ((await res.json()) as { price: number }).price;
        }
        const parish = await price(0.05, 0.05);
        const discount = await price(0.03, 0.06);
        assert(
          discount < parish,
          `a low-coupon, high-yield bond should price below the par-ish bond (${discount} vs ${parish})`
        );
      });

      await t.step("analytics POST /bond-price rejects missing fields", async () => {
        const res = await fetch(`${AN}/bond-price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ couponRate: 0.05 }),
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("analytics POST /yield-curve returns a populated curve", async () => {
        const res = await fetch(`${AN}/yield-curve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal: T(),
        });
        assertEquals(res.status, 200);
        const body = (await res.json()) as {
          curve?: Array<{ tenor: string; yield: number }>;
        };
        const curve = body.curve ?? [];
        assert(Array.isArray(curve) && curve.length > 0, "yield curve should have points");
      });

      await t.step("news GET /news requires a symbol", async () => {
        const res = await fetch(`${NEWS}/news`, { signal: T() });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("news GET /news returns an array for a symbol", async () => {
        const res = await fetch(`${NEWS}/news?symbol=AAPL&limit=5`, {
          signal: T(),
        });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()), "news items should be an array");
      });

      await t.step("news GET /sources lists configured feed sources", async () => {
        const res = await fetch(`${NEWS}/sources`, { signal: T() });
        assertEquals(res.status, 200);
        const sources = (await res.json()) as Array<{ id: string }>;
        assert(Array.isArray(sources) && sources.length > 0, "expected at least one source");
        assert(
          sources.every((s) => typeof s.id === "string"),
          "each source needs an id"
        );
      });

      await t.step("recommendation-engine GET /recommendations returns an array", async () => {
        const res = await fetch(`${REC}/recommendations?limit=10`, {
          signal: T(),
        });
        assertEquals(res.status, 200);
        assert(Array.isArray(await res.json()), "recommendations should be an array");
      });
    } finally {
      await stack.teardown();
    }
  },
});
