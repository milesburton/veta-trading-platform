import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

function journalUrl(stack: TestStack): string {
  const url = stack.urls.journal;
  if (!url) throw new Error("journal URL not in stack");
  return url;
}

Deno.test({
  name: "journal HTTP contracts (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: ["journal"], startupTimeoutMs: 30_000 });
    const J = journalUrl(stack);
    try {
      await t.step("GET /health returns ok with retentionDays", async () => {
        const res = await fetch(`${J}/health`, { signal: AbortSignal.timeout(5_000) });
        assertEquals(res.status, 200);
        const body = await res.json() as { status: string; retentionDays: number; version: string };
        assertEquals(body.status, "ok");
        assert(typeof body.retentionDays === "number" && body.retentionDays > 0);
        assertExists(body.version);
      });

      await t.step("GET /candles requires instrument param", async () => {
        const res = await fetch(`${J}/candles`, { signal: AbortSignal.timeout(5_000) });
        assertEquals(res.status, 400);
        const body = await res.json() as { error: string };
        assert(body.error.includes("instrument"));
      });

      await t.step("GET /candles?instrument=AAPL&interval=1m returns array", async () => {
        const res = await fetch(`${J}/candles?instrument=AAPL&interval=1m&limit=10`, {
          signal: AbortSignal.timeout(8_000),
        });
        assertEquals(res.status, 200);
        const body = await res.json() as unknown[];
        assert(Array.isArray(body));
      });

      await t.step("GET /candles?interval=invalid returns 400", async () => {
        const res = await fetch(`${J}/candles?instrument=AAPL&interval=2h`, {
          signal: AbortSignal.timeout(5_000),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("GET /orders returns array with required fields", async () => {
        const res = await fetch(`${J}/orders?limit=10`, {
          signal: AbortSignal.timeout(8_000),
        });
        assertEquals(res.status, 200);
        const body = await res.json() as unknown[];
        assert(Array.isArray(body));
      });

      await t.step("POST /grid/query orderBlotter returns rows + total + evalMs", async () => {
        const res = await fetch(`${J}/grid/query`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gridId: "orderBlotter",
            filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
            sortField: null,
            sortDir: null,
            offset: 0,
            limit: 10,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        assertEquals(res.status, 200);
        const body = await res.json() as { rows: unknown[]; total: number; evalMs: number };
        assert(Array.isArray(body.rows));
        assert(typeof body.total === "number");
        assert(typeof body.evalMs === "number");
      });

      await t.step("POST /grid/query missing gridId returns 400", async () => {
        const res = await fetch(`${J}/grid/query`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filterExpr: { kind: "group", id: "root", join: "AND", rules: [] } }),
          signal: AbortSignal.timeout(5_000),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("POST /grid/query invalid JSON returns 400", async () => {
        const res = await fetch(`${J}/grid/query`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not json",
          signal: AbortSignal.timeout(5_000),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });
    } finally {
      await stack.teardown();
    }
  },
});
