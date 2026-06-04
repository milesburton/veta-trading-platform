// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import type { GatewayContext } from "../gateway/context.ts";
import { handleTelemetryRoute } from "../gateway/routes/telemetry.ts";

function makeContext(role: string): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve({
        user: { id: "u-1", name: "Test", role, avatar_emoji: "🧪" },
      }),
  } as unknown as GatewayContext;
}

function unauthContext(): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
  } as unknown as GatewayContext;
}

Deno.test("ignores non-telemetry paths", async () => {
  const ctx = makeContext("trader");
  const res = await handleTelemetryRoute(new Request("http://localhost/other"), "/other", ctx);
  assertEquals(res, null);
});

Deno.test("rejects unauthenticated requests", async () => {
  const ctx = unauthContext();
  const res = await handleTelemetryRoute(
    new Request("http://localhost/telemetry/frontend", { method: "POST", body: "{}" }),
    "/telemetry/frontend",
    ctx
  );
  assertEquals(res?.status, 401);
});

Deno.test("rejects POST with missing memory fields", async () => {
  const ctx = makeContext("trader");
  const res = await handleTelemetryRoute(
    new Request("http://localhost/telemetry/frontend", {
      method: "POST",
      body: JSON.stringify({ jsHeapSizeUsed: 1 }),
    }),
    "/telemetry/frontend",
    ctx
  );
  assertEquals(res?.status, 400);
});

Deno.test("accepts well-formed POST and returns ok", async () => {
  const ctx = makeContext("trader");
  const res = await handleTelemetryRoute(
    new Request("http://localhost/telemetry/frontend", {
      method: "POST",
      body: JSON.stringify({
        jsHeapSizeUsed: 100_000_000,
        totalJSHeapSize: 200_000_000,
        jsHeapSizeLimit: 4_000_000_000,
      }),
    }),
    "/telemetry/frontend",
    ctx
  );
  assertEquals(res?.status, 200);
  const body = await res?.json();
  assertEquals(body, { ok: true });
});

Deno.test("rejects GET for non-admin/non-oncall", async () => {
  const ctx = makeContext("trader");
  const res = await handleTelemetryRoute(
    new Request("http://localhost/telemetry/frontend", { method: "GET" }),
    "/telemetry/frontend",
    ctx
  );
  assertEquals(res?.status, 403);
});

Deno.test("admin can GET aggregated samples", async () => {
  const ctx = makeContext("admin");
  const res = await handleTelemetryRoute(
    new Request("http://localhost/telemetry/frontend", { method: "GET" }),
    "/telemetry/frontend",
    ctx
  );
  assertEquals(res?.status, 200);
});
