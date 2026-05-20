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

interface CapturedFetch {
  calls: { url: string; body: string }[];
  discordCalls: () => { url: string; body: string }[];
  restore: () => void;
}

function captureFetch(): CapturedFetch {
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as string });
    // Renderer calls return an empty 204 — notifyDiscord then falls
    // back to the text-only message path. Discord webhook responses
    // are also 204; the distinction is purely the URL hostname.
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  return {
    calls,
    discordCalls: () => calls.filter((c) => c.url.includes("discord.com/api/webhooks/")),
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
      const discord = f.discordCalls();
      assertEquals(discord.length, 1);
      assertEquals(discord[0].url, "https://discord.com/api/webhooks/123/abc");
      const body = JSON.parse(discord[0].body);
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
      assertEquals(f.discordCalls().length, 1);
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

// ─── Grafana panel attachment ────────────────────────────────────

function captureFetchWithRender(pngBytes: Uint8Array): CapturedFetch {
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as string });
    if (String(url).includes("/render/d-solo/")) {
      return Promise.resolve(
        new Response(pngBytes as BodyInit, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  return {
    calls,
    discordCalls: () => calls.filter((c) => c.url.includes("discord.com/api/webhooks/")),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

Deno.test("notifyDiscord attaches a Grafana panel screenshot when render succeeds", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    // 1x1 valid PNG so the renderer mock returns a real image payload.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]);
    const f = captureFetchWithRender(png);
    try {
      await notifyDiscord(
        { severity: "CRITICAL", source: "kill-switch", message: "fired" },
        "u-1",
      );

      const renderCalls = f.calls.filter((c) => c.url.includes("/render/d-solo/"));
      assertEquals(renderCalls.length, 1, "renderer should be called once");

      const discord = f.discordCalls();
      assertEquals(discord.length, 1);
      // multipart form body, not JSON. The captured body should be a
      // FormData stringification — look for the payload_json field name.
      const body = discord[0].body;
      const isMultipart = typeof body === "object" || body.includes("payload_json");
      assertEquals(
        isMultipart,
        true,
        "Discord POST body should be multipart/form-data when a screenshot is attached",
      );
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscord falls back to text-only when render returns non-image", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      // captureFetch returns 204 with no content-type for every URL,
      // including /render/d-solo. renderer helper rejects non-image
      // responses and returns null, so notifyDiscord takes the JSON path.
      await notifyDiscord(
        { severity: "CRITICAL", source: "kill-switch", message: "fired" },
        "u-1",
      );
      const discord = f.discordCalls();
      assertEquals(discord.length, 1);
      // JSON body, not multipart
      const body = JSON.parse(discord[0].body);
      assertEquals(body.username, "VETA Alerts");
      assertEquals(body.attachments, undefined);
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscord sanitises attachment filename derived from alert.source", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]);
    // Intercept the FormData object before stringification so we can
    // inspect the actual filename Discord would see.
    const seenFilenames: string[] = [];
    const baseFetch: typeof fetch = ((url: string, init?: RequestInit) => {
      if (String(url).includes("discord.com/api/webhooks/") && init?.body instanceof FormData) {
        const fileEntry = (init.body as FormData).get("files[0]");
        if (fileEntry instanceof File) {
          seenFilenames.push(fileEntry.name);
        }
      }
      if (String(url).includes("/render/d-solo/")) {
        return Promise.resolve(
          new Response(png as BodyInit, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;
    globalThis.fetch = baseFetch;
    try {
      await notifyDiscord(
        {
          severity: "CRITICAL",
          // Hostile source: slashes, quotes, newlines, control chars.
          source: '../etc/passwd"\r\n; rm -rf /',
          message: "fired",
        },
        "u-1",
      );
      assertEquals(seenFilenames.length, 1, "expected one multipart attachment");
      const name = seenFilenames[0];
      // No path separators or quotes
      assertEquals(name.includes("/"), false);
      assertEquals(name.includes('"'), false);
      assertEquals(name.includes("\\"), false);
      assertEquals(name.includes("\r"), false);
      assertEquals(name.includes("\n"), false);
      // Length capped
      assertEquals(name.length <= 100, true, `filename too long: ${name.length}`);
      // Still starts with the alert-... prefix and ends with .png
      assertEquals(name.startsWith("alert-"), true);
      assertEquals(name.endsWith(".png"), true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

Deno.test("notifyDiscord skips renderer entirely when DISCORD_ATTACH_GRAFANA_PANELS=false", async () => {
  Deno.env.set("DISCORD_ATTACH_GRAFANA_PANELS", "false");
  try {
    await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
      const f = captureFetch();
      try {
        await notifyDiscord(
          { severity: "CRITICAL", source: "kill-switch", message: "fired" },
          "u-1",
        );
        const renderCalls = f.calls.filter((c) => c.url.includes("/render/"));
        assertEquals(renderCalls.length, 0);
        assertEquals(f.discordCalls().length, 1);
      } finally {
        f.restore();
      }
    });
  } finally {
    Deno.env.delete("DISCORD_ATTACH_GRAFANA_PANELS");
  }
});
