import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
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
  "rfq-service",
  "dark-pool",
  "ccp-service",
] as const;

Deno.test({
  name: "trading venues: rfq sell-side, dark-pool, ccp (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: [...SERVICES],
      startupTimeoutMs: 60_000,
    });
    const RFQ = url(stack, "rfq-service");
    const DARK = url(stack, "dark-pool");
    const CCP = url(stack, "ccp-service");

    try {
      await t.step(
        "rfq sell-side full lifecycle: request → route → markup → confirm",
        async () => {
          const createRes = await fetch(`${RFQ}/rfq/sellside`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientUserId: "ext-client-1",
              asset: "AAPL",
              side: "BUY",
              quantity: 500,
              limitPrice: 190,
            }),
            signal: T(),
          });
          assertEquals(createRes.status, 200);
          const created = (await createRes.json()) as {
            rfqId: string;
            state: string;
          };
          assertExists(created.rfqId);
          assertEquals(created.state, "CLIENT_REQUEST");
          const rfqId = created.rfqId;

          const routeRes = await fetch(`${RFQ}/rfq/sellside/${rfqId}/route`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ salesUserId: "sales-1" }),
            signal: T(),
          });
          assertEquals(routeRes.status, 200);
          const routed = (await routeRes.json()) as {
            state: string;
            dealerBestPrice: number;
          };
          assertEquals(routed.state, "SALES_MARKUP");
          assert(
            routed.dealerBestPrice > 0,
            "dealer best price should be set after routing",
          );

          const markupRes = await fetch(`${RFQ}/rfq/sellside/${rfqId}/markup`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ salesUserId: "sales-1", markupBps: 25 }),
            signal: T(),
          });
          assertEquals(markupRes.status, 200);
          const marked = (await markupRes.json()) as {
            state: string;
            clientQuotedPrice: number;
            dealerBestPrice: number;
          };
          assertEquals(marked.state, "CLIENT_CONFIRMATION");
          assert(
            marked.clientQuotedPrice > marked.dealerBestPrice,
            "BUY markup should quote the client above the dealer price",
          );

          const confirmRes = await fetch(
            `${RFQ}/rfq/sellside/${rfqId}/confirm`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientUserId: "ext-client-1" }),
              signal: T(),
            },
          );
          assertEquals(confirmRes.status, 200);
          const confirmed = (await confirmRes.json()) as { state: string };
          assertEquals(confirmed.state, "CONFIRMED");
        },
      );

      await t.step(
        "rfq sell-side rejects an out-of-order state transition",
        async () => {
          const createRes = await fetch(`${RFQ}/rfq/sellside`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientUserId: "ext-client-2",
              asset: "MSFT",
              side: "SELL",
              quantity: 100,
              limitPrice: 400,
            }),
            signal: T(),
          });
          const { rfqId } = (await createRes.json()) as { rfqId: string };

          const confirmTooEarly = await fetch(
            `${RFQ}/rfq/sellside/${rfqId}/confirm`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientUserId: "ext-client-2" }),
              signal: T(),
            },
          );
          assertEquals(confirmTooEarly.status, 409);
          await confirmTooEarly.body?.cancel();
        },
      );

      await t.step(
        "rfq sell-side wrong sales user is forbidden at markup",
        async () => {
          const createRes = await fetch(`${RFQ}/rfq/sellside`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientUserId: "ext-client-3",
              asset: "AAPL",
              side: "BUY",
              quantity: 100,
              limitPrice: 190,
            }),
            signal: T(),
          });
          const { rfqId } = (await createRes.json()) as { rfqId: string };
          await (await fetch(`${RFQ}/rfq/sellside/${rfqId}/route`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ salesUserId: "sales-1" }),
            signal: T(),
          })).body?.cancel();

          const wrongUser = await fetch(`${RFQ}/rfq/sellside/${rfqId}/markup`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              salesUserId: "sales-impostor",
              markupBps: 10,
            }),
            signal: T(),
          });
          assertEquals(wrongUser.status, 403);
          await wrongUser.body?.cancel();
        },
      );

      await t.step(
        "rfq sell-side stats reflect created RFQs by state",
        async () => {
          const res = await fetch(`${RFQ}/rfq/sellside/stats`, { signal: T() });
          assertEquals(res.status, 200);
          const stats = (await res.json()) as {
            total: number;
            byState: Record<string, number>;
          };
          assert(
            stats.total >= 3,
            `expected at least 3 RFQs created, got ${stats.total}`,
          );
          assertEquals(stats.byState.CONFIRMED, 1);
        },
      );

      await t.step(
        "dark-pool /pool/stats reports a well-formed structure",
        async () => {
          const res = await fetch(`${DARK}/pool/stats`, { signal: T() });
          assertEquals(res.status, 200);
          const stats = (await res.json()) as {
            service: string;
            matchCycleMs: number;
            totalMatchedAllTime: number;
            currentDepth: Record<string, unknown>;
          };
          assertEquals(stats.service, "dark-pool");
          assert(
            stats.matchCycleMs > 0,
            "match cycle should be a positive interval",
          );
          assertEquals(typeof stats.totalMatchedAllTime, "number");
          assertExists(stats.currentDepth);
        },
      );

      await t.step("ccp /ccp/stats reports clearing counters", async () => {
        const res = await fetch(`${CCP}/ccp/stats`, { signal: T() });
        assertEquals(res.status, 200);
        const stats = (await res.json()) as {
          service: string;
          totalNovated: number;
          totalSettled: number;
          marginAccountCount: number;
        };
        assertEquals(stats.service, "ccp-service");
        assertEquals(typeof stats.totalNovated, "number");
        assertEquals(typeof stats.totalSettled, "number");
        assertEquals(typeof stats.marginAccountCount, "number");
      });

      await t.step(
        "ccp /ccp/margin returns a zeroed account for an unknown user",
        async () => {
          const res = await fetch(`${CCP}/ccp/margin/nobody-here`, {
            signal: T(),
          });
          assertEquals(res.status, 200);
          const acct = (await res.json()) as {
            userId: string;
            initialMarginPosted: number;
            netMarginRequired: number;
            positions: Record<string, unknown>;
          };
          assertEquals(acct.userId, "nobody-here");
          assertEquals(acct.initialMarginPosted, 0);
          assertEquals(acct.netMarginRequired, 0);
          assertEquals(Object.keys(acct.positions).length, 0);
        },
      );

      await t.step(
        "ccp /ccp/settlements returns the pending obligation queue",
        async () => {
          const res = await fetch(`${CCP}/ccp/settlements`, { signal: T() });
          assertEquals(res.status, 200);
          const body = (await res.json()) as {
            obligations: unknown[];
            total: number;
          };
          assert(Array.isArray(body.obligations));
          assertEquals(typeof body.total, "number");
        },
      );
    } finally {
      await stack.teardown();
    }
  },
});
