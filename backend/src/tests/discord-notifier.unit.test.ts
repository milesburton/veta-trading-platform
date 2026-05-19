// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import {
  buildHeartbeatMessage,
  notifyDiscord,
  startHeartbeat,
} from "../gateway/discord-notifier.ts";

const REAL_WEBHOOK = Deno.env.get("DISCORD_WEBHOOK_URL");
const realFetch = globalThis.fetch;

function withWebhook<T>(url: string, fn: () => Promise<T>): Promise<T> {
  Deno.env.set("DISCORD_WEBHOOK_URL", url);
  return fn().finally(() => {
    if (REAL_WEBHOOK === undefined) Deno.env.delete("DISCORD_WEBHOOK_URL");
    else Deno.env.set("DISCORD_WEBHOOK_URL", REAL_WEBHOOK);
  });
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

Deno.test("notifyDiscord skips when webhook URL is not configured", async () => {
  const orig = Deno.env.get("DISCORD_WEBHOOK_URL");
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  const f = captureFetch();
  try {
    await notifyDiscord({ severity: "CRITICAL", message: "test" }, "u-1");
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
    if (orig !== undefined) Deno.env.set("DISCORD_WEBHOOK_URL", orig);
  }
});

Deno.test("notifyDiscord skips when severity is INFO", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      await notifyDiscord({ severity: "INFO", message: "noise" }, "u-1");
      assertEquals(f.calls.length, 0);
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscord posts on CRITICAL alerts", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      await notifyDiscord(
        { severity: "CRITICAL", source: "kill-switch", message: "kill switch fired" },
        "u-1",
      );
      assertEquals(f.calls.length, 1);
      assertEquals(f.calls[0].url, "https://discord.com/api/webhooks/123/abc");
      const body = JSON.parse(f.calls[0].body);
      assertEquals(body.username, "VETA Alerts");
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscord posts on WARNING alerts", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      await notifyDiscord(
        { severity: "WARNING", source: "order", message: "order rejected" },
        "u-1",
      );
      assertEquals(f.calls.length, 1);
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscord rejects sentinel placeholder URL", async () => {
  await withWebhook("https://discord.com/api/webhooks/0/REPLACE_ME", async () => {
    const f = captureFetch();
    try {
      await notifyDiscord({ severity: "CRITICAL", message: "test" }, "u-1");
      assertEquals(f.calls.length, 0);
    } finally {
      f.restore();
    }
  });
});

Deno.test("buildHeartbeatMessage shows ✅ when all services up", () => {
  const msg = buildHeartbeatMessage({
    version: "abc1234567",
    environment: "prod",
    uptimeMs: 3 * 60 * 60 * 1000,
    services: { gateway: true, oms: true, ems: true },
    ts: 0,
  });
  assertEquals(msg.startsWith("✅"), true);
  assertEquals(msg.includes("3/3 services up"), true);
  assertEquals(msg.includes("`abc1234`"), true);
  assertEquals(msg.includes("(prod)"), true);
  assertEquals(msg.includes("🟢 `gateway`"), true);
});

Deno.test("buildHeartbeatMessage shows 🚨 when more than two services down", () => {
  const msg = buildHeartbeatMessage({
    version: "v1",
    environment: "dev",
    uptimeMs: 60_000,
    services: { gateway: true, oms: false, ems: false, journal: false },
    ts: 0,
  });
  assertEquals(msg.startsWith("🚨"), true);
  assertEquals(msg.includes("1/4 services up"), true);
  assertEquals(msg.includes("🔴 `oms`"), true);
});

Deno.test("buildHeartbeatMessage shows ⚠️ when one or two services down", () => {
  const msg = buildHeartbeatMessage({
    version: "v1",
    environment: "dev",
    uptimeMs: 60_000,
    services: { gateway: true, oms: true, ems: false },
    ts: 0,
  });
  assertEquals(msg.startsWith("⚠️"), true);
});

Deno.test("startHeartbeat fires immediately and on interval", async () => {
  const snapshots: number[] = [];
  const handle = startHeartbeat({
    version: "test",
    environment: "test",
    startedAt: Date.now(),
    getServices: () => ({ gateway: true }),
    intervalMs: 50,
    sender: () => {
      snapshots.push(Date.now());
      return Promise.resolve(true);
    },
  });
  await new Promise((r) => setTimeout(r, 175));
  handle.stop();
  // 1 immediate + ~3 interval fires within 175ms
  if (snapshots.length < 3) {
    throw new Error(`expected at least 3 fires, got ${snapshots.length}`);
  }
});

Deno.test("startHeartbeat skips fire when services snapshot is null", async () => {
  let sent = 0;
  const handle = startHeartbeat({
    version: "test",
    environment: "test",
    startedAt: Date.now(),
    getServices: () => null,
    intervalMs: 50,
    sender: () => {
      sent++;
      return Promise.resolve(true);
    },
  });
  await new Promise((r) => setTimeout(r, 175));
  handle.stop();
  assertEquals(sent, 0);
});
