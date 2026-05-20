// fallow-ignore-file unused-file
//
// End-to-end test of the bug-report + alert pipelines that should each
// reach Discord and (for CRITICAL alerts only) GitHub.
//
// Confirms three pipelines stay wired:
//
//   POST /bug-report                           -> Discord
//   POST /alerts  (severity != CRITICAL)       -> Discord
//   POST /alerts  (severity == CRITICAL)       -> Discord + GitHub issue
//
// The handlers fan out to outbound fetch calls (Discord webhook, GitHub
// API). The test mocks globalThis.fetch with URL-based dispatch and
// asserts that the right hostnames received the right number of calls.
// No real network is touched. The test is also the canonical record of
// the bug-report-via-Discord-to-GitHub story raised in the
// 2026-05-20 incident postmortem: bug reports only reach Discord, and
// the GitHub-issue fan-out is reserved for CRITICAL alerts.

import { assertEquals, assert } from "jsr:@std/assert@0.217";
import { handleAlertsRoute } from "../gateway/routes/alerts.ts";
import { handleBugReportRoute } from "../gateway/routes/bug-report.ts";
import type { GatewayContext } from "../gateway/context.ts";

interface CapturedCall {
  url: string;
  method: string;
  body: string | null;
}

interface FetchCapture {
  calls: CapturedCall[];
  discordCalls: () => CapturedCall[];
  githubIssueCreates: () => CapturedCall[];
  githubIssueSearches: () => CapturedCall[];
  userServiceCalls: () => CapturedCall[];
  restore: () => void;
}

const realFetch = globalThis.fetch;

function installFetchCapture(): FetchCapture {
  const calls: CapturedCall[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = (init?.body as string | null) ?? null;
    calls.push({ url: String(url), method, body });

    if (String(url).includes("discord.com/api/webhooks/")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (String(url).includes("api.github.com") && String(url).includes("/search/issues")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    if (String(url).includes("api.github.com") && String(url).includes("/issues")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ number: 1234, html_url: "https://github.com/foo/bar/issues/1234" }),
          { status: 201 },
        ),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  return {
    calls,
    discordCalls: () => calls.filter((c) => c.url.includes("discord.com/api/webhooks/")),
    githubIssueCreates: () =>
      calls.filter(
        (c) =>
          c.url.includes("api.github.com") &&
          c.url.endsWith("/issues") &&
          c.method === "POST",
      ),
    githubIssueSearches: () =>
      calls.filter((c) => c.url.includes("api.github.com") && c.url.includes("/search/issues")),
    userServiceCalls: () =>
      calls.filter(
        (c) =>
          !c.url.includes("discord.com") &&
          !c.url.includes("api.github.com"),
      ),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function makeContext(): GatewayContext {
  return {
    requireAuth: (_req: Request) =>
      Promise.resolve({
        user: { id: "u-test", name: "E2E Tester", role: "admin", avatar_emoji: "🧪" },
        limits: {
          max_order_qty: 1000,
          max_daily_notional: 1000000,
          allowed_strategies: ["LIMIT"],
        },
      }),
    urls: { userService: "http://user-service-stub:5008" },
  } as unknown as GatewayContext;
}

function withEnv<T>(values: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    prev[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

Deno.test("E2E: POST /bug-report reaches Discord but not GitHub", async () => {
  await withEnv(
    {
      DISCORD_BUG_WEBHOOK_URL: "https://discord.com/api/webhooks/1/bug-channel",
      DISCORD_WEBHOOK_URL: undefined,
      GITHUB_TICKETING_TOKEN: "ghp_xxxxxxxxxxxxxxxxxxxx",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = installFetchCapture();
      try {
        const res = await handleBugReportRoute(
          new Request("http://localhost/bug-report", {
            method: "POST",
            body: JSON.stringify({
              title: "Test bug from E2E suite",
              description:
                "This is a synthetic bug report. It should fan out to Discord only.",
              category: "ui",
              url: "/dashboard",
            }),
          }),
          "/bug-report",
          makeContext(),
        );

        assertEquals(res?.status, 200, "bug-report should return 200 when webhook is set");
        assertEquals(f.discordCalls().length, 1, "bug report should hit Discord exactly once");
        assertEquals(
          f.githubIssueCreates().length,
          0,
          "bug report must NOT create a GitHub issue; that flow is CRITICAL-alert-only",
        );

        const discordBody = JSON.parse(f.discordCalls()[0].body!);
        assertEquals(discordBody.username, "VETA Bug Reports");
        assert(
          discordBody.content.includes("Test bug from E2E suite"),
          "Discord payload should contain the bug title",
        );
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("E2E: POST /alerts with severity=CRITICAL fans out to Discord AND GitHub", async () => {
  await withEnv(
    {
      DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/2/alert-channel",
      DISCORD_BUG_WEBHOOK_URL: undefined,
      GITHUB_TICKETING_TOKEN: "ghp_xxxxxxxxxxxxxxxxxxxx",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = installFetchCapture();
      try {
        const alertBody = JSON.stringify({
          severity: "CRITICAL",
          source: "kill-switch",
          message: "synthetic E2E critical alert",
          detail: "this would be a real outage in prod",
          ts: Date.now(),
        });
        const res = await handleAlertsRoute(
          new Request("http://localhost/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: alertBody,
          }),
          "/alerts",
          makeContext(),
        );

        // alerts.ts fans out to Discord + GitHub via fire-and-forget
        // Promise.allSettled inside notifyDiscordFromBody, then forwards
        // to user-service. Yield to let the microtasks drain.
        await new Promise((r) => setTimeout(r, 50));

        assert(res !== null, "alerts route should handle POST /alerts");
        assertEquals(f.discordCalls().length, 1, "CRITICAL alert should hit Discord once");
        assertEquals(
          f.githubIssueCreates().length,
          1,
          "CRITICAL alert should create exactly one GitHub issue",
        );
        assertEquals(
          f.githubIssueSearches().length,
          1,
          "CRITICAL alert should search for an existing issue first (dedup)",
        );

        const issueBody = JSON.parse(f.githubIssueCreates()[0].body!);
        assert(
          issueBody.title.startsWith("[CRITICAL]"),
          "GitHub issue title should start with [CRITICAL]",
        );
        assert(
          issueBody.labels.includes("severity:critical"),
          "GitHub issue should carry severity:critical label",
        );
        assert(
          issueBody.labels.includes("prod-issue"),
          "GitHub issue should carry prod-issue label",
        );

        assertEquals(
          f.userServiceCalls().length,
          1,
          "alert should also forward to the user-service for in-app persistence",
        );
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("E2E: POST /alerts with severity=WARNING reaches Discord but NOT GitHub", async () => {
  await withEnv(
    {
      DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/2/alert-channel",
      DISCORD_BUG_WEBHOOK_URL: undefined,
      GITHUB_TICKETING_TOKEN: "ghp_xxxxxxxxxxxxxxxxxxxx",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = installFetchCapture();
      try {
        const alertBody = JSON.stringify({
          severity: "WARNING",
          source: "synthetic",
          message: "warning-level event from E2E test",
          ts: Date.now(),
        });
        await handleAlertsRoute(
          new Request("http://localhost/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: alertBody,
          }),
          "/alerts",
          makeContext(),
        );
        await new Promise((r) => setTimeout(r, 50));

        assertEquals(f.discordCalls().length, 1, "WARNING alert should hit Discord");
        assertEquals(
          f.githubIssueCreates().length,
          0,
          "WARNING alert must NOT create a GitHub issue; only CRITICAL escalates",
        );
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("E2E: bug-report responds 202 when Discord webhook is not configured", async () => {
  // Mirrors the production fallback: if no webhook is set, the report is
  // accepted but not delivered. The caller gets a 202 so the UI can
  // surface "queued, not yet delivered" rather than "succeeded".
  await withEnv(
    {
      DISCORD_BUG_WEBHOOK_URL: undefined,
      DISCORD_WEBHOOK_URL: undefined,
    },
    async () => {
      const f = installFetchCapture();
      try {
        const res = await handleBugReportRoute(
          new Request("http://localhost/bug-report", {
            method: "POST",
            body: JSON.stringify({
              title: "Bug without webhook",
              description: "Description long enough to count as a valid report.",
            }),
          }),
          "/bug-report",
          makeContext(),
        );
        assertEquals(res?.status, 202);
        assertEquals(f.discordCalls().length, 0);
        assertEquals(f.githubIssueCreates().length, 0);
      } finally {
        f.restore();
      }
    },
  );
});
