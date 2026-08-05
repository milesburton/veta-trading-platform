// fallow-ignore-file unused-file
//
// Pipeline test for the bug-report + alert fan-out paths. Confirms:
//
//   POST /bug-report                       -> Discord + GitHub issue
//   POST /alerts  (severity = CRITICAL)    -> Discord + GitHub issue
//   POST /alerts  (severity = WARNING)     -> Discord (only)
//
// The notifier only posts to Discord for severities CRITICAL and
// WARNING — other severities are dropped before any fetch. GitHub
// alert issues are reserved for CRITICAL alerts; user tickets create
// lower-severity GitHub issues through their own labels.
//
// The handlers fan out to outbound fetch calls (Discord webhook, GitHub
// API, user-service forward). The test installs a fetch mock with
// strict allow-listed hostnames; any unrecognised hostname throws so
// regressions (e.g., a fetch to the wrong GitHub endpoint) fail the
// test rather than slipping through the default branch.
//
// Written after the 2026-05-20 postmortem to keep the bug/alert
// pipeline shape pinned by an automated test rather than a runbook.

import { assert, assertEquals } from "jsr:@std/assert@0.217";
import type { GatewayContext } from "../gateway/context.ts";
import { handleAlertsRoute } from "../gateway/routes/alerts.ts";
import { handleBugReportRoute } from "../gateway/routes/bug-report.ts";

interface CapturedCall {
  url: string;
  hostname: string;
  pathname: string;
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
const USER_SERVICE_STUB_HOSTNAME = "user-service-stub";

function installFetchCapture(): FetchCapture {
  const calls: CapturedCall[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = (init?.body as string | null) ?? null;
    // Use URL parsing so we match by hostname, not by substring. A
    // substring like "api.github.com" can appear anywhere in a URL
    // (e.g., a malicious-controlled path), which CodeQL flagged.
    const parsed = new URL(String(url));
    const hostname = parsed.hostname;
    const pathname = parsed.pathname;
    calls.push({ url: String(url), hostname, pathname, method, body });

    if (hostname === "discord.com" && pathname.startsWith("/api/webhooks/")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (hostname === "api.github.com" && pathname.startsWith("/search/issues")) {
      return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    }
    if (hostname === "api.github.com" && pathname.endsWith("/issues") && method === "POST") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ number: 1234, html_url: "https://github.com/foo/bar/issues/1234" }),
          { status: 201 }
        )
      );
    }
    if (hostname === USER_SERVICE_STUB_HOSTNAME) {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }
    // Throw on any unrecognised host so regressions fail loudly rather
    // than being absorbed by a permissive default-branch response.
    throw new Error(
      `installFetchCapture: unexpected fetch to ${method} ${hostname}${pathname}; ` +
        `add an explicit handler if this is a new wired-up dependency`
    );
  }) as typeof fetch;

  return {
    calls,
    discordCalls: () => calls.filter((c) => c.hostname === "discord.com"),
    githubIssueCreates: () =>
      calls.filter(
        (c) =>
          c.hostname === "api.github.com" && c.pathname.endsWith("/issues") && c.method === "POST"
      ),
    githubIssueSearches: () =>
      calls.filter(
        (c) => c.hostname === "api.github.com" && c.pathname.startsWith("/search/issues")
      ),
    userServiceCalls: () => calls.filter((c) => c.hostname === USER_SERVICE_STUB_HOSTNAME),
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
          max_daily_notional: 1_000_000,
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

Deno.test("pipeline: POST /bug-report reaches Discord and creates a user ticket", async () => {
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
                "This is a synthetic user ticket. It should fan out to Discord and GitHub.",
              kind: "feature",
              category: "ui",
              url: "/dashboard",
            }),
          }),
          "/bug-report",
          makeContext()
        );

        assertEquals(res?.status, 200, "bug-report should return 200 when webhook is set");
        assertEquals(f.discordCalls().length, 1, "bug report should hit Discord exactly once");
        assertEquals(f.githubIssueCreates().length, 1, "user ticket should create a GitHub issue");
        assertEquals(
          f.githubIssueSearches().length,
          0,
          "user tickets do not run alert-style dedupe searches"
        );

        const discordCall = f.discordCalls()[0];
        if (!discordCall) throw new Error("expected a Discord call");
        const discordBody = JSON.parse(discordCall.body!);
        assertEquals(discordBody.username, "VETA User Tickets");
        assert(
          discordBody.content.includes("Test bug from E2E suite"),
          "Discord payload should contain the bug title"
        );
        const issueCall = f.githubIssueCreates()[0];
        if (!issueCall?.body) throw new Error("expected a GitHub issue create payload");
        const issueBody = JSON.parse(issueCall.body);
        assertEquals(issueBody.labels.includes("user-ticket"), true);
        assertEquals(issueBody.labels.includes("type:feature"), true);
      } finally {
        f.restore();
      }
    }
  );
});

Deno.test("pipeline: POST /alerts with severity=CRITICAL fans out to Discord AND GitHub", async () => {
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
          makeContext()
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
          "CRITICAL alert should create exactly one GitHub issue"
        );
        assertEquals(
          f.githubIssueSearches().length,
          1,
          "CRITICAL alert should search for an existing issue first (dedup)"
        );

        const issueCall = f.githubIssueCreates()[0];
        if (!issueCall) throw new Error("expected a GitHub issue create call");
        if (!issueCall.body) throw new Error("expected a GitHub issue create payload");
        const issueBody = JSON.parse(issueCall.body);
        assert(
          issueBody.title.startsWith("[CRITICAL]"),
          "GitHub issue title should start with [CRITICAL]"
        );
        assert(
          issueBody.labels.includes("severity:critical"),
          "GitHub issue should carry severity:critical label"
        );
        assert(
          issueBody.labels.includes("prod-issue"),
          "GitHub issue should carry prod-issue label"
        );

        assertEquals(
          f.userServiceCalls().length,
          1,
          "alert should also forward to the user-service for in-app persistence"
        );
      } finally {
        f.restore();
      }
    }
  );
});

Deno.test("pipeline: POST /alerts with severity=WARNING reaches Discord but NOT GitHub", async () => {
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
          makeContext()
        );
        await new Promise((r) => setTimeout(r, 50));

        assertEquals(f.discordCalls().length, 1, "WARNING alert should hit Discord");
        assertEquals(
          f.githubIssueCreates().length,
          0,
          "WARNING alert must NOT create a GitHub issue; only CRITICAL escalates"
        );
      } finally {
        f.restore();
      }
    }
  );
});

Deno.test("pipeline: bug-report responds 202 when no external ticket sink is configured", async () => {
  // Mirrors the production fallback: if no webhook or GitHub token is
  // set, the report is accepted by the gateway but has no durable
  // external sink. The caller gets a 202 so the UI can surface that.
  await withEnv(
    {
      DISCORD_BUG_WEBHOOK_URL: undefined,
      DISCORD_WEBHOOK_URL: undefined,
      GITHUB_TICKETING_TOKEN: undefined,
      GITHUB_TICKETING_REPO: undefined,
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
          makeContext()
        );
        assertEquals(res?.status, 202);
        assertEquals(f.discordCalls().length, 0);
        assertEquals(f.githubIssueCreates().length, 0);
      } finally {
        f.restore();
      }
    }
  );
});
