import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

function mdsUrl(stack: TestStack): string {
  const url = stack.urls["market-data"];
  if (!url) throw new Error("market-data URL not in stack");
  return url;
}

const T = (ms = 8_000) => AbortSignal.timeout(ms);

Deno.test({
  name: "market-data HTTP contracts (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: ["market-data"], startupTimeoutMs: 30_000 });
    const M = mdsUrl(stack);
    try {
      await t.step("GET /health returns ok with override count", async () => {
        const res = await fetch(`${M}/health`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as {
          status: string;
          overrides: number;
          alphaVantageConfigured: boolean;
        };
        assertEquals(body.status, "ok");
        assert(typeof body.overrides === "number" && body.overrides >= 0);
        assert(typeof body.alphaVantageConfigured === "boolean");
      });

      await t.step("GET /sources returns non-empty array with id, label, enabled", async () => {
        const res = await fetch(`${M}/sources`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { id: string; label: string; enabled: boolean }[];
        assert(Array.isArray(body) && body.length > 0);
        const synthetic = body.find((s) => s.id === "synthetic");
        assertExists(synthetic, "synthetic source must be present");
      });

      await t.step("GET /overrides returns overrides object", async () => {
        const res = await fetch(`${M}/overrides`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { overrides: Record<string, string> };
        assertExists(body.overrides);
      });

      await t.step("PUT /overrides sets and retrieves an override", async () => {
        const putRes = await fetch(`${M}/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: { TSLA: "synthetic" } }),
          signal: T(),
        });
        assertEquals(putRes.status, 200);
        await putRes.body?.cancel();

        const getRes = await fetch(`${M}/overrides`, { signal: T() });
        assertEquals(getRes.status, 200);
        const body = (await getRes.json()) as { overrides: Record<string, string> };
        assert(typeof body.overrides === "object");
      });

      await t.step("PUT /overrides with unknown source returns 400", async () => {
        const res = await fetch(`${M}/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrides: { AAPL: "bloomberg" } }),
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("PUT /overrides with invalid JSON returns 400", async () => {
        const res = await fetch(`${M}/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: "{ not json",
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("PUT /overrides missing overrides key returns 400", async () => {
        const res = await fetch(`${M}/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: { AAPL: "synthetic" } }),
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("POST /sources/unknown-source/toggle returns 400", async () => {
        const res = await fetch(`${M}/sources/bloomberg/toggle`, {
          method: "POST",
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("GET /cache returns object", async () => {
        const res = await fetch(`${M}/cache`, { signal: T() });
        assertEquals(res.status, 200);
        const body = (await res.json()) as unknown;
        assert(typeof body === "object" && body !== null);
      });
    } finally {
      await stack.teardown();
    }
  },
});
