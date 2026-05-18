// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import { handleBugReportRoute } from "../gateway/routes/bug-report.ts";
import type { GatewayContext } from "../gateway/context.ts";

const realFetch = globalThis.fetch;
const realWebhookAlerts = Deno.env.get("DISCORD_WEBHOOK_URL");
const realWebhookBug = Deno.env.get("DISCORD_BUG_WEBHOOK_URL");

function makeContext(role = "trader"): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve({
        user: { id: "u-1", name: "Test User", role, avatar_emoji: "🧪" },
      }),
  } as unknown as GatewayContext;
}

function unauthContext(): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
      ),
  } as unknown as GatewayContext;
}

function restoreEnv() {
  if (realWebhookAlerts === undefined) Deno.env.delete("DISCORD_WEBHOOK_URL");
  else Deno.env.set("DISCORD_WEBHOOK_URL", realWebhookAlerts);
  if (realWebhookBug === undefined) Deno.env.delete("DISCORD_BUG_WEBHOOK_URL");
  else Deno.env.set("DISCORD_BUG_WEBHOOK_URL", realWebhookBug);
}

function captureFetch(): { calls: { url: string; body: string }[]; restore: () => void } {
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string });
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

Deno.test("ignores paths other than /bug-report", async () => {
  const res = await handleBugReportRoute(
    new Request("http://localhost/other", { method: "POST" }),
    "/other",
    makeContext(),
  );
  assertEquals(res, null);
});

Deno.test("ignores non-POST methods on /bug-report", async () => {
  const res = await handleBugReportRoute(
    new Request("http://localhost/bug-report", { method: "GET" }),
    "/bug-report",
    makeContext(),
  );
  assertEquals(res, null);
});

Deno.test("requires authentication", async () => {
  const res = await handleBugReportRoute(
    new Request("http://localhost/bug-report", { method: "POST", body: "{}" }),
    "/bug-report",
    unauthContext(),
  );
  assertEquals(res?.status, 401);
});

Deno.test("rejects invalid JSON", async () => {
  const res = await handleBugReportRoute(
    new Request("http://localhost/bug-report", { method: "POST", body: "not-json" }),
    "/bug-report",
    makeContext(),
  );
  assertEquals(res?.status, 400);
});

Deno.test("rejects missing title", async () => {
  const res = await handleBugReportRoute(
    new Request("http://localhost/bug-report", {
      method: "POST",
      body: JSON.stringify({ description: "Long enough description here" }),
    }),
    "/bug-report",
    makeContext(),
  );
  assertEquals(res?.status, 400);
});

Deno.test("rejects too-short description", async () => {
  const res = await handleBugReportRoute(
    new Request("http://localhost/bug-report", {
      method: "POST",
      body: JSON.stringify({ title: "Login broken", description: "short" }),
    }),
    "/bug-report",
    makeContext(),
  );
  assertEquals(res?.status, 400);
});

Deno.test("returns 202 when webhook is not configured (report received but not delivered)", async () => {
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  Deno.env.delete("DISCORD_BUG_WEBHOOK_URL");
  const res = await handleBugReportRoute(
    new Request("http://localhost/bug-report", {
      method: "POST",
      body: JSON.stringify({
        title: "Login button is broken",
        description: "Pressing it does nothing on Firefox latest.",
      }),
    }),
    "/bug-report",
    makeContext(),
  );
  assertEquals(res?.status, 202);
  restoreEnv();
});

Deno.test("posts to dedicated bug webhook when set, marks ok", async () => {
  Deno.env.set("DISCORD_BUG_WEBHOOK_URL", "https://discord.com/api/webhooks/123/abc");
  const f = captureFetch();
  try {
    const res = await handleBugReportRoute(
      new Request("http://localhost/bug-report", {
        method: "POST",
        headers: { "user-agent": "TestAgent/1.0" },
        body: JSON.stringify({
          title: "Bug title",
          description: "A description that is plenty long enough to count as a real bug report.",
          category: "ui",
          url: "/some/page",
        }),
      }),
      "/bug-report",
      makeContext(),
    );
    assertEquals(res?.status, 200);
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].url, "https://discord.com/api/webhooks/123/abc");
    const body = JSON.parse(f.calls[0].body);
    assertEquals(body.username, "VETA Bug Reports");
  } finally {
    f.restore();
    restoreEnv();
  }
});

Deno.test("falls back to alerts webhook when bug webhook unset", async () => {
  Deno.env.delete("DISCORD_BUG_WEBHOOK_URL");
  Deno.env.set("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/999/zzz");
  const f = captureFetch();
  try {
    const res = await handleBugReportRoute(
      new Request("http://localhost/bug-report", {
        method: "POST",
        body: JSON.stringify({
          title: "Some bug",
          description: "Something is not working as expected at all.",
        }),
      }),
      "/bug-report",
      makeContext(),
    );
    assertEquals(res?.status, 200);
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].url, "https://discord.com/api/webhooks/999/zzz");
  } finally {
    f.restore();
    restoreEnv();
  }
});

Deno.test("rejects category values not in the allowlist", async () => {
  Deno.env.set("DISCORD_BUG_WEBHOOK_URL", "https://discord.com/api/webhooks/123/abc");
  const f = captureFetch();
  try {
    const res = await handleBugReportRoute(
      new Request("http://localhost/bug-report", {
        method: "POST",
        body: JSON.stringify({
          title: "Some bug",
          description: "Something is not working as expected at all.",
          category: "rce-attempt",
        }),
      }),
      "/bug-report",
      makeContext(),
    );
    // Posts succeed but category is dropped silently
    assertEquals(res?.status, 200);
    const body = JSON.parse(f.calls[0].body);
    // Default username; category line should not appear with "rce-attempt"
    assertEquals(body.content.includes("rce-attempt"), false);
  } finally {
    f.restore();
    restoreEnv();
  }
});
