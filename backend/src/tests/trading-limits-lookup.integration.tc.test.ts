import { assertEquals } from "jsr:@std/assert@0.217";
import { startStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const SERVICE_TOKEN_HEADER = "x-veta-service-token";
const SERVICE_TOKEN = "test-internal-service-token";
const T = () => AbortSignal.timeout(8_000);

Deno.test({
  name: "user-service trading limits lookup for service callers (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({ services: ["user-service"], startupTimeoutMs: 60_000 });
    const base = stack.urls["user-service"];
    if (!base) throw new Error("user-service URL not in stack");

    try {
      await t.step("rejects a request with no credentials", async () => {
        const res = await fetch(`${base}/users/luca/limits`, { signal: T() });
        await res.body?.cancel();
        assertEquals(res.status, 401);
      });

      await t.step("rejects a request with the wrong service token", async () => {
        const res = await fetch(`${base}/users/luca/limits`, {
          headers: { [SERVICE_TOKEN_HEADER]: "not-the-token" },
          signal: T(),
        });
        await res.body?.cancel();
        assertEquals(res.status, 401);
      });

      await t.step("returns the real desks for a user with the service token", async () => {
        const res = await fetch(`${base}/users/luca/limits`, {
          headers: { [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN },
          signal: T(),
        });
        assertEquals(res.status, 200);
        const body = (await res.json()) as { allowed_desks: string[] };
        assertEquals(body.allowed_desks.includes("fx"), true);
      });

      await t.step("returns 404 for an unknown user with the service token", async () => {
        const res = await fetch(`${base}/users/no-such-user/limits`, {
          headers: { [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN },
          signal: T(),
        });
        await res.body?.cancel();
        assertEquals(res.status, 404);
      });
    } finally {
      await stack.teardown();
    }
  },
});
