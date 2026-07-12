// fallow-ignore-file unused-file
import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  buildLoadgenMessage,
  isBugReportValid,
  notifyDiscord,
  notifyDiscordBug,
  notifyDiscordLoadgen,
  sendDailySummary,
} from "../gateway/discord-notifier.ts";

const REAL_WEBHOOK = Deno.env.get("DISCORD_WEBHOOK_URL");
const realFetch = globalThis.fetch;
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/123/abc";

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

for (const testCase of [
  {
    label: "notifyDiscord skips when severity is INFO",
    webhook: DISCORD_WEBHOOK,
    alert: { severity: "INFO", message: "noise" },
    expectedCalls: 0,
  },
  {
    label: "notifyDiscord posts on CRITICAL alerts",
    webhook: DISCORD_WEBHOOK,
    alert: {
      severity: "CRITICAL",
      source: "kill-switch",
      message: "kill switch fired",
    },
    expectedCalls: 1,
    expectedUsername: "VETA Alerts",
  },
  {
    label: "notifyDiscord posts on WARNING alerts",
    webhook: DISCORD_WEBHOOK,
    alert: {
      severity: "WARNING",
      source: "order",
      message: "order rejected",
    },
    expectedCalls: 1,
  },
  {
    label: "notifyDiscord rejects sentinel placeholder URL",
    webhook: "https://discord.com/api/webhooks/0/REPLACE_ME",
    alert: { severity: "CRITICAL", message: "test" },
    expectedCalls: 0,
  },
] as const) {
  Deno.test(testCase.label, async () => {
    await withWebhook(testCase.webhook, async () => {
      const f = captureFetch();
      try {
        await notifyDiscord(testCase.alert, "u-1");
        const discordCalls = f.discordCalls();
        assertEquals(discordCalls.length, testCase.expectedCalls);
        if (testCase.expectedCalls === 1 && testCase.expectedUsername) {
          assertEquals(discordCalls[0].url, testCase.webhook);
          const body = JSON.parse(discordCalls[0].body);
          assertEquals(body.username, testCase.expectedUsername);
        }
      } finally {
        f.restore();
      }
    });
  });
}

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

for (const testCase of [
  {
    label: "sendDailySummary posts as VETA Daily",
    content: "hello daily",
    assertBody: (body: { username: string; content: string }) => {
      assertEquals(body.username, "VETA Daily");
      assertEquals(body.content, "hello daily");
    },
  },
  {
    label: "sendDailySummary truncates messages over 1900 chars",
    content: "a".repeat(5000),
    assertBody: (body: { username: string; content: string }) => {
      assertEquals(body.content.length <= 1900, true);
      assertEquals(body.content.endsWith("…"), true);
    },
  },
] as const) {
  Deno.test(testCase.label, async () => {
    await withWebhook(DISCORD_WEBHOOK, async () => {
      const f = captureFetch();
      try {
        const ok = await sendDailySummary(testCase.content);
        assertEquals(ok, true);
        assertEquals(f.calls.length, 1);
        testCase.assertBody(JSON.parse(f.calls[0].body));
      } finally {
        f.restore();
      }
    });
  });
}

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
        })
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
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    ]);
    const f = captureFetchWithRender(png);
    try {
      await notifyDiscord({ severity: "CRITICAL", source: "kill-switch", message: "fired" }, "u-1");

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
        "Discord POST body should be multipart/form-data when a screenshot is attached"
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
      await notifyDiscord({ severity: "CRITICAL", source: "kill-switch", message: "fired" }, "u-1");
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
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
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
          })
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
        "u-1"
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
          "u-1"
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

Deno.test("notifyDiscord swallows fetch errors and continues", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("net down"))) as typeof fetch;
    try {
      await notifyDiscord(
        {
          severity: "CRITICAL",
          source: "kill-switch",
          message: "x",
        },
        "u-1"
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

Deno.test("isBugReportValid accepts and rejects the expected shapes", () => {
  const cases = [
    { report: { title: "", description: "long enough body" }, valid: false },
    { report: { title: "ok", description: "short" }, valid: false },
    { report: { title: "ab", description: "long enough body" }, valid: false },
    {
      report: { title: "good title", description: "long enough body" },
      valid: true,
    },
  ];

  for (const { report, valid } of cases) {
    assertEquals(isBugReportValid(report), valid);
  }
});

Deno.test("notifyDiscordBug returns false when report is invalid", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      const ok = await notifyDiscordBug({ title: "x", description: "y" }, "u-1", "Alice");
      assertEquals(ok, false);
      assertEquals(f.calls.length, 0);
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscordBug returns false when no webhook is configured", async () => {
  const prev = Deno.env.get("DISCORD_WEBHOOK_URL");
  const prevBug = Deno.env.get("DISCORD_BUG_WEBHOOK_URL");
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  Deno.env.delete("DISCORD_BUG_WEBHOOK_URL");
  try {
    const ok = await notifyDiscordBug(
      { title: "valid title", description: "valid description here" },
      "u-1",
      "Alice"
    );
    assertEquals(ok, false);
  } finally {
    if (prev !== undefined) Deno.env.set("DISCORD_WEBHOOK_URL", prev);
    if (prevBug !== undefined) Deno.env.set("DISCORD_BUG_WEBHOOK_URL", prevBug);
  }
});

Deno.test("notifyDiscordBug posts as 'VETA User Tickets' with all optional fields", async () => {
  await withWebhook("https://discord.com/api/webhooks/123/abc", async () => {
    const f = captureFetch();
    try {
      const ok = await notifyDiscordBug(
        {
          title: "Chart freezes on tab switch",
          description: "Steps to reproduce: 1. Open dashboard 2. Switch tab. Result: spinner.",
          kind: "bug",
          category: "ui",
          url: "https://veta/dashboard",
          userAgent: "Mozilla/5.0 Firefox",
        },
        "u-42",
        "Alice"
      );
      assertEquals(ok, true);
      const calls = f.discordCalls();
      assertEquals(calls.length, 1);
      const body = JSON.parse(calls[0].body);
      assertEquals(body.username, "VETA User Tickets");
      assert(body.content.includes("Chart freezes"));
      assert(body.content.includes("Alice"));
      assert(body.content.includes("Type: `bug`"));
      assert(body.content.includes("Category: `ui`"));
      assert(body.content.includes("Page: https://veta/dashboard"));
      assert(body.content.includes("UA: `Mozilla/5.0 Firefox`"));
    } finally {
      f.restore();
    }
  });
});

Deno.test("notifyDiscordBug prefers DISCORD_BUG_WEBHOOK_URL when set", async () => {
  const prevBug = Deno.env.get("DISCORD_BUG_WEBHOOK_URL");
  Deno.env.set("DISCORD_BUG_WEBHOOK_URL", "https://discord.com/api/webhooks/999/bug");
  await withWebhook("https://discord.com/api/webhooks/123/alerts", async () => {
    const f = captureFetch();
    try {
      await notifyDiscordBug(
        { title: "valid title", description: "valid description here" },
        "u-1",
        "Alice"
      );
      const calls = f.discordCalls();
      assertEquals(calls.length, 1);
      assertEquals(calls[0].url, "https://discord.com/api/webhooks/999/bug");
    } finally {
      f.restore();
    }
  });
  if (prevBug === undefined) Deno.env.delete("DISCORD_BUG_WEBHOOK_URL");
  else Deno.env.set("DISCORD_BUG_WEBHOOK_URL", prevBug);
});

for (const testCase of [
  {
    label: "buildLoadgenMessage formats start with a runner and note",
    payload: {
      event: "start",
      runner: "k6-burst-2026-05-23",
      note: "30m",
    } as const,
    startsWith: "🧪 **Loadgen `k6-burst-2026-05-23` started** — 30m",
    includes: "disregard",
  },
  {
    label: "buildLoadgenMessage formats stop without a note",
    payload: { event: "stop", runner: "k6" } as const,
    startsWith: "✅ **Loadgen `k6` stopped**",
    includes: "real signal",
  },
] as const) {
  Deno.test(testCase.label, () => {
    const msg = buildLoadgenMessage(testCase.payload);
    assert(msg.startsWith(testCase.startsWith));
    assert(msg.includes(testCase.includes));
  });
}

Deno.test("buildLoadgenMessage sanitises newlines in runner / note", () => {
  const msg = buildLoadgenMessage({
    event: "start",
    runner: "k6\nbad",
    note: "ev\nil",
  });
  assertEquals(msg.includes("\n", msg.indexOf("Loadgen")), true);
  const runnerPart = msg.match(/`([^`]+)`/)?.[1] ?? "";
  assertEquals(runnerPart.includes("\n"), false);
});

Deno.test("notifyDiscordLoadgen returns false when webhook is missing", async () => {
  const prev = Deno.env.get("DISCORD_WEBHOOK_URL");
  Deno.env.delete("DISCORD_WEBHOOK_URL");
  try {
    const ok = await notifyDiscordLoadgen({ event: "start", runner: "k6" });
    assertEquals(ok, false);
  } finally {
    if (prev !== undefined) Deno.env.set("DISCORD_WEBHOOK_URL", prev);
  }
});

Deno.test("notifyDiscordLoadgen posts as 'VETA Loadgen'", async () => {
  await withWebhook(DISCORD_WEBHOOK, async () => {
    const f = captureFetch();
    try {
      const ok = await notifyDiscordLoadgen({ event: "stop", runner: "k6" });
      assertEquals(ok, true);
      const calls = f.discordCalls();
      assertEquals(calls.length, 1);
      const body = JSON.parse(calls[0].body);
      assertEquals(body.username, "VETA Loadgen");
    } finally {
      f.restore();
    }
  });
});
