// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import { _internalForTests, createTicketForAlert } from "../gateway/ticketing.ts";

const REAL_TOKEN = Deno.env.get("GITHUB_TICKETING_TOKEN");
const REAL_REPO = Deno.env.get("GITHUB_TICKETING_REPO");
const realFetch = globalThis.fetch;

function withEnv<T>(
  values: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
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

function captureFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: (init?.body as string | null) ?? null,
    });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

Deno.test("createTicketForAlert skips non-CRITICAL severities", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = captureFetch(() => new Response(null, { status: 201 }));
      try {
        const r = await createTicketForAlert({ severity: "WARNING", message: "x" }, "u-1");
        assertEquals(r.created, false);
        assertEquals(r.reason, "non-critical");
        assertEquals(f.calls.length, 0);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert no-ops when token is missing", async () => {
  await withEnv(
    { GITHUB_TICKETING_TOKEN: undefined, GITHUB_TICKETING_REPO: "foo/bar" },
    async () => {
      const f = captureFetch(() => new Response(null, { status: 201 }));
      try {
        const r = await createTicketForAlert({ severity: "CRITICAL", message: "x" }, "u-1");
        assertEquals(r.created, false);
        assertEquals(r.reason, "no-token");
        assertEquals(f.calls.length, 0);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert no-ops when repo is missing or invalid", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "",
    },
    async () => {
      const f = captureFetch(() => new Response(null, { status: 201 }));
      try {
        const r = await createTicketForAlert({ severity: "CRITICAL", message: "x" }, "u-1");
        assertEquals(r.created, false);
        assertEquals(r.reason, "no-repo");
        assertEquals(f.calls.length, 0);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert creates an issue on first CRITICAL", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = captureFetch((url) => {
        if (url.includes("/search/issues")) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ number: 99, html_url: "https://github.com/foo/bar/issues/99" }),
          { status: 201 },
        );
      });
      try {
        const r = await createTicketForAlert(
          {
            severity: "CRITICAL",
            source: "kill-switch",
            message: "fired",
            detail: "all-traders block",
            ts: 1_700_000_000_000,
          },
          "u-99",
        );
        assertEquals(r.created, true);
        assertEquals(r.issueNumber, 99);
        assertEquals(r.url, "https://github.com/foo/bar/issues/99");
        const create = f.calls.find((c) => c.method === "POST");
        assertEquals(create !== undefined, true);
        const body = JSON.parse(create!.body!);
        assertEquals(body.title.startsWith("[CRITICAL]"), true);
        assertEquals(body.title.includes("kill-switch"), true);
        assertEquals(body.labels.includes("prod-issue"), true);
        assertEquals(body.labels.includes("auto-created"), true);
        assertEquals(body.labels.includes("severity:critical"), true);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert dedupes onto a recent open issue", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const recent = new Date(Date.now() - 60_000).toISOString();
      const f = captureFetch((url) => {
        if (url.includes("/search/issues")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  number: 42,
                  html_url: "https://github.com/foo/bar/issues/42",
                  state: "open",
                  title: "[CRITICAL] kill-switch: fired",
                  created_at: recent,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(null, { status: 201 });
      });
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "kill-switch", message: "fired" },
          "u-99",
        );
        assertEquals(r.created, false);
        assertEquals(r.issueNumber, 42);
        assertEquals(r.reason, "deduped-onto-existing");
        const commentCall = f.calls.find((c) =>
          c.url.includes("/issues/42/comments")
        );
        assertEquals(commentCall !== undefined, true);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("buildTitle truncates long messages", () => {
  const title = _internalForTests.buildTitle({
    severity: "CRITICAL",
    source: "x",
    message: "a".repeat(500),
  });
  assertEquals(title.length < 200, true);
});

Deno.test("buildTitle and buildBody sanitise newlines in messages", () => {
  const title = _internalForTests.buildTitle({
    severity: "CRITICAL",
    source: "src",
    message: "first\nsecond\rthird",
  });
  assertEquals(title.includes("\n"), false);
  assertEquals(title.includes("\r"), false);
});

if (REAL_TOKEN !== undefined) Deno.env.set("GITHUB_TICKETING_TOKEN", REAL_TOKEN);
if (REAL_REPO !== undefined) Deno.env.set("GITHUB_TICKETING_REPO", REAL_REPO);
