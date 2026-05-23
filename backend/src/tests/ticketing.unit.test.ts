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

Deno.test("readTokenEnv rejects REPLACE_ME placeholder tokens", () => {
  const prev = Deno.env.get("GITHUB_TICKETING_TOKEN");
  Deno.env.set("GITHUB_TICKETING_TOKEN", "ghp_REPLACE_ME_with_real_token_here");
  try {
    assertEquals(_internalForTests.readTokenEnv(), null);
  } finally {
    if (prev !== undefined) Deno.env.set("GITHUB_TICKETING_TOKEN", prev);
    else Deno.env.delete("GITHUB_TICKETING_TOKEN");
  }
});

Deno.test("readRepoEnv rejects invalid repo formats", () => {
  const prev = Deno.env.get("GITHUB_TICKETING_REPO");
  Deno.env.set("GITHUB_TICKETING_REPO", "no-slash-here");
  try {
    assertEquals(_internalForTests.readRepoEnv(), null);
  } finally {
    if (prev !== undefined) Deno.env.set("GITHUB_TICKETING_REPO", prev);
    else Deno.env.delete("GITHUB_TICKETING_REPO");
  }
});

Deno.test("buildBody includes Correlation line when runId is provided", () => {
  const body = _internalForTests.buildBody(
    { severity: "CRITICAL", source: "src", message: "m" },
    "u-1",
    "run-abc",
  );
  assertEquals(body.includes("_Correlation: run-abc_"), true);
});

Deno.test("buildBody includes Detail block when detail is provided", () => {
  const body = _internalForTests.buildBody(
    { severity: "CRITICAL", source: "src", message: "m", detail: "stack trace here" },
    "u-1",
    null,
  );
  assertEquals(body.includes("**Detail:**"), true);
  assertEquals(body.includes("stack trace here"), true);
});

Deno.test("createTicketForAlert ignores deduplicate hits older than the 1h window", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const tooOld = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const f = captureFetch((url) => {
        if (url.includes("/search/issues")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  number: 7,
                  html_url: "https://github.com/foo/bar/issues/7",
                  state: "open",
                  title: "[CRITICAL] src: m",
                  created_at: tooOld,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ number: 100, html_url: "https://github.com/foo/bar/issues/100" }),
          { status: 201 },
        );
      });
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "src", message: "m" },
          "u-1",
        );
        assertEquals(r.created, true);
        assertEquals(r.issueNumber, 100);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert returns github-api-failed when issue creation 5xx", async () => {
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
        return new Response("upstream blew up", { status: 502 });
      });
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "src", message: "m" },
          "u-1",
        );
        assertEquals(r.created, false);
        assertEquals(r.reason, "github-api-failed");
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert handles findOpenDuplicate non-OK by creating", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = captureFetch((url) => {
        if (url.includes("/search/issues")) {
          return new Response("auth bad", { status: 401 });
        }
        return new Response(
          JSON.stringify({ number: 11, html_url: "https://github.com/foo/bar/issues/11" }),
          { status: 201 },
        );
      });
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "src", message: "m" },
          "u-1",
        );
        assertEquals(r.created, true);
        assertEquals(r.issueNumber, 11);
      } finally {
        f.restore();
      }
    },
  );
});

Deno.test("createTicketForAlert handles findOpenDuplicate fetch throw by creating", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      let isSearch = true;
      globalThis.fetch = ((_url: string, _init?: RequestInit) => {
        if (isSearch) {
          isSearch = false;
          return Promise.reject(new Error("network down"));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ number: 22, html_url: "https://github.com/foo/bar/issues/22" }),
            { status: 201 },
          ),
        );
      }) as typeof fetch;
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "src", message: "m" },
          "u-1",
        );
        assertEquals(r.created, true);
        assertEquals(r.issueNumber, 22);
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  );
});

Deno.test("createTicketForAlert handles createIssue fetch throw", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      let call = 0;
      globalThis.fetch = ((_url: string) => {
        call++;
        if (call === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ items: [] }), { status: 200 }),
          );
        }
        return Promise.reject(new Error("connect ETIMEDOUT"));
      }) as typeof fetch;
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "src", message: "m" },
          "u-1",
        );
        assertEquals(r.created, false);
        assertEquals(r.reason, "github-api-failed");
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  );
});

Deno.test("createTicketForAlert handles commentOnIssue throw silently while deduping", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const recent = new Date(Date.now() - 60_000).toISOString();
      let call = 0;
      globalThis.fetch = ((_url: string) => {
        call++;
        if (call === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  {
                    number: 33,
                    html_url: "https://github.com/foo/bar/issues/33",
                    state: "open",
                    title: "[CRITICAL] src: m",
                    created_at: recent,
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.reject(new Error("comment write fail"));
      }) as typeof fetch;
      try {
        const r = await createTicketForAlert(
          { severity: "CRITICAL", source: "src", message: "m" },
          "u-1",
        );
        assertEquals(r.created, false);
        assertEquals(r.issueNumber, 33);
        assertEquals(r.reason, "deduped-onto-existing");
      } finally {
        globalThis.fetch = realFetch;
      }
    },
  );
});

if (REAL_TOKEN !== undefined) Deno.env.set("GITHUB_TICKETING_TOKEN", REAL_TOKEN);
if (REAL_REPO !== undefined) Deno.env.set("GITHUB_TICKETING_REPO", REAL_REPO);
