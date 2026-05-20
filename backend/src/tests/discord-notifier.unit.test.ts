// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import { notifyDiscord, sendDailySummary } from "../gateway/discord-notifier.ts";

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

Deno.test("sendDailySummary no-ops without webhook env", async () => {
  const orig = Deno.env.get("DISCORD_WEBHOOK_URL");
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  const f = captureFetch();
  try {
    const ok = await sendDailySummary("daily content");
    assertEquals(ok, false);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
    if (orig !== undefined) Deno.env.set("DISCORD_WEBHOOK_URL", orig);
  }
});

Deno.test("sendDailySummary posts as VETA Daily", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      const ok = await sendDailySummary("hello daily");
      assertEquals(ok, true);
      assertEquals(f.calls.length, 1);
      const body = JSON.parse(f.calls[0].body);
      assertEquals(body.username, "VETA Daily");
      assertEquals(body.content, "hello daily");
    } finally {
      f.restore();
    }
  });
});

Deno.test("sendDailySummary truncates messages over 1900 chars", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      await sendDailySummary("a".repeat(5000));
      assertEquals(f.calls.length, 1);
      const body = JSON.parse(f.calls[0].body);
      assertEquals(body.content.length <= 1900, true);
      assertEquals(body.content.endsWith("…"), true);
    } finally {
      f.restore();
    }
  });
});
