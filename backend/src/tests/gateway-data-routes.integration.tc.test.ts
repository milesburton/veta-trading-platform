import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";
const T = (ms = 10_000) => AbortSignal.timeout(ms);

function get(gw: string, path: string, cookie?: string): Promise<Response> {
  return fetch(`${gw}${path}`, {
    headers: cookie ? { Cookie: `veta_user=${cookie}` } : {},
    signal: T(),
  });
}

test({
  name: "gateway data routes (testcontainers): audit, reports and journal reads behind real roles",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack: TestStack = await startStack({
      services: ["user-service", "gateway", "journal"],
      startupTimeoutMs: 60_000,
    });
    try {
      const gw = stack.urls.gateway ?? "";
      const trader = await login(stack, "alice");
      const compliance = await login(stack, "compliance");

      await t.step("anonymous callers are refused on the data routes", async () => {
        for (const path of ["/orders", "/audit/events", "/audit/verify", "/reports/transactions"]) {
          const res = await get(gw, path);
          assertEquals(res.status, 401, `${path} should refuse an anonymous caller`);
          await res.body?.cancel();
        }
      });

      await t.step("a trader reads orders but not the audit trail or reports", async () => {
        const orders = await get(gw, "/orders?limit=5", trader);
        assertEquals(orders.status, 200);
        assert(Array.isArray(await orders.json()), "orders should be an array");

        for (const path of [
          "/audit/events",
          "/audit/verify",
          "/reports/transactions?date=2026-01-01",
        ]) {
          const res = await get(gw, path, trader);
          assertEquals(res.status, 403, `${path} should refuse a trader`);
          await res.body?.cancel();
        }
      });

      await t.step("compliance reads the audit trail and the chain verifies", async () => {
        const events = await get(gw, "/audit/events?limit=10", compliance);
        assertEquals(events.status, 200);
        assert(Array.isArray(await events.json()), "audit events should be an array");

        const verify = await get(gw, "/audit/verify", compliance);
        assertEquals(verify.status, 200);
        const body = (await verify.json()) as { ok: boolean; brokenSeq: number | null };
        assertEquals(body.ok, true);
        assertEquals(body.brokenSeq, null);
      });

      await t.step("transaction reports validate their parameters and support csv", async () => {
        const json = await get(gw, "/reports/transactions?date=2026-01-01", compliance);
        assertEquals(json.status, 200);
        const report = (await json.json()) as { date: string; count: number };
        assertEquals(report.date, "2026-01-01");
        assertEquals(report.count, 0);

        const csv = await get(gw, "/reports/transactions?date=2026-01-01&format=csv", compliance);
        assertEquals(csv.status, 200);
        assert((csv.headers.get("content-type") ?? "").startsWith("text/csv"));
        await csv.body?.cancel();

        const badDate = await get(gw, "/reports/transactions?date=yesterday", compliance);
        assertEquals(badDate.status, 400);
        await badDate.body?.cancel();

        const badFormat = await get(
          gw,
          "/reports/transactions?date=2026-01-01&format=xml",
          compliance
        );
        assertEquals(badFormat.status, 400);
        await badFormat.body?.cancel();
      });

      await t.step("the signed-in profile reflects the role", async () => {
        const res = await get(gw, "/me", compliance);
        assertEquals(res.status, 200);
        const body = (await res.json()) as { user: { id: string; role: string } };
        assertEquals(body.user.id, "compliance");
        assertEquals(body.user.role, "compliance");
      });
    } finally {
      await stack.teardown();
    }
  },
});
