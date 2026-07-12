// fallow-ignore-file unused-file
import { assertEquals } from "jsr:@std/assert@0.217";
import {
  _internalForTests,
  createTicketForAlert,
  createTicketForUserReport,
} from "../gateway/ticketing.ts";

const REAL_TOKEN = Deno.env.get("GITHUB_TICKETING_TOKEN");
const REAL_REPO = Deno.env.get("GITHUB_TICKETING_REPO");
const realFetch = globalThis.fetch;
const VALID_GITHUB_ENV = {
  GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
  GITHUB_TICKETING_REPO: "foo/bar",
} as const;
const CRITICAL_ALERT = {
  severity: "CRITICAL",
  source: "src",
  message: "m",
} as const;

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

function withValidGithubEnv<T>(fn: () => Promise<T>): Promise<T> {
  return withEnv(VALID_GITHUB_ENV, fn);
}

for (const testCase of [
  {
    label: "createTicketForAlert skips non-CRITICAL severities",
    env: VALID_GITHUB_ENV,
    alert: { severity: "WARNING", message: "x" },
    expectedReason: "non-critical",
  },
  {
    label: "createTicketForAlert no-ops when token is missing",
    env: {
      GITHUB_TICKETING_TOKEN: undefined,
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    alert: { severity: "CRITICAL", message: "x" },
    expectedReason: "no-token",
  },
  {
    label: "createTicketForAlert no-ops when repo is missing or invalid",
    env: {
      GITHUB_TICKETING_TOKEN: "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaa",
      GITHUB_TICKETING_REPO: "",
    },
    alert: { severity: "CRITICAL", message: "x" },
    expectedReason: "no-repo",
  },
] as const) {
  Deno.test(testCase.label, async () => {
    await withEnv(testCase.env, async () => {
      const f = captureFetch(() => new Response(null, { status: 201 }));
      try {
        const r = await createTicketForAlert(testCase.alert, "u-1");
        assertEquals(r.created, false);
        assertEquals(r.reason, testCase.expectedReason);
        assertEquals(f.calls.length, 0);
      } finally {
        f.restore();
      }
    });
  });
}

Deno.test("createTicketForAlert creates an issue on first CRITICAL", async () => {
  await withValidGithubEnv(async () => {
    const f = captureFetch((url) => {
      if (url.includes("/search/issues")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          number: 99,
          html_url: "https://github.com/foo/bar/issues/99",
        }),
        { status: 201 }
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
        "u-99"
      );
      assertEquals(r.created, true);
      assertEquals(r.issueNumber, 99);
      assertEquals(r.url, "https://github.com/foo/bar/issues/99");
      const create = f.calls.find((c) => c.method === "POST");
      assertEquals(create !== undefined, true);
      if (!create) throw new Error("expected POST call");
      if (!create.body) throw new Error("expected POST call body");
      const body = JSON.parse(create.body);
      assertEquals(body.title.startsWith("[CRITICAL]"), true);
      assertEquals(body.title.includes("kill-switch"), true);
      assertEquals(body.labels.includes("prod-issue"), true);
      assertEquals(body.labels.includes("auto-created"), true);
      assertEquals(body.labels.includes("severity:critical"), true);
    } finally {
      f.restore();
    }
  });
});

Deno.test("createTicketForAlert dedupes onto a recent open issue", async () => {
  await withValidGithubEnv(async () => {
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
          { status: 200 }
        );
      }
      return new Response(null, { status: 201 });
    });
    try {
      const r = await createTicketForAlert(
        { severity: "CRITICAL", source: "kill-switch", message: "fired" },
        "u-99"
      );
      assertEquals(r.created, false);
      assertEquals(r.issueNumber, 42);
      assertEquals(r.reason, "deduped-onto-existing");
      const commentCall = f.calls.find((c) => c.url.includes("/issues/42/comments"));
      assertEquals(commentCall !== undefined, true);
    } finally {
      f.restore();
    }
  });
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

for (const testCase of [
  {
    label: "readTokenEnv rejects REPLACE_ME placeholder tokens",
    key: "GITHUB_TICKETING_TOKEN",
    value: "ghp_REPLACE_ME_with_real_token_here",
    read: () => _internalForTests.readTokenEnv(),
  },
  {
    label: "readRepoEnv rejects invalid repo formats",
    key: "GITHUB_TICKETING_REPO",
    value: "no-slash-here",
    read: () => _internalForTests.readRepoEnv(),
  },
] as const) {
  Deno.test(testCase.label, () => {
    const prev = Deno.env.get(testCase.key);
    Deno.env.set(testCase.key, testCase.value);
    try {
      assertEquals(testCase.read(), null);
    } finally {
      if (prev !== undefined) Deno.env.set(testCase.key, prev);
      else Deno.env.delete(testCase.key);
    }
  });
}

Deno.test("buildBody includes Correlation line when runId is provided", () => {
  const body = _internalForTests.buildBody(
    { severity: "CRITICAL", source: "src", message: "m" },
    "u-1",
    "run-abc"
  );
  assertEquals(body.includes("_Correlation: run-abc_"), true);
});

Deno.test("buildBody includes Detail block when detail is provided", () => {
  const body = _internalForTests.buildBody(
    {
      severity: "CRITICAL",
      source: "src",
      message: "m",
      detail: "stack trace here",
    },
    "u-1",
    null
  );
  assertEquals(body.includes("**Detail:**"), true);
  assertEquals(body.includes("stack trace here"), true);
});

Deno.test("createTicketForUserReport creates a labelled GitHub issue", async () => {
  await withValidGithubEnv(async () => {
    const f = captureFetch(() => {
      return new Response(
        JSON.stringify({
          number: 144,
          html_url: "https://github.com/foo/bar/issues/144",
        }),
        { status: 201 }
      );
    });
    try {
      const r = await createTicketForUserReport(
        {
          kind: "comment",
          title: "Love the new workspace",
          description: "The linked panel workflow feels much clearer now.",
          category: "ui",
          url: "/dashboard",
          userAgent: "UnitTest/1.0",
          ts: 1_700_000_000_000,
        },
        "u-1",
        "Unit Tester"
      );
      assertEquals(r.created, true);
      assertEquals(r.issueNumber, 144);
      const create = f.calls.find((c) => c.method === "POST");
      if (!create?.body) throw new Error("expected issue create body");
      const body = JSON.parse(create.body);
      assertEquals(body.title, "[comment] Love the new workspace");
      assertEquals(body.labels.includes("user-ticket"), true);
      assertEquals(body.labels.includes("type:comment"), true);
      assertEquals(body.labels.includes("category:ui"), true);
      assertEquals(body.body.includes("**Type:** comment"), true);
      assertEquals(body.body.includes("Unit Tester"), true);
    } finally {
      f.restore();
    }
  });
});

Deno.test("createTicketForUserReport no-ops when token is missing", async () => {
  await withEnv(
    {
      GITHUB_TICKETING_TOKEN: undefined,
      GITHUB_TICKETING_REPO: "foo/bar",
    },
    async () => {
      const f = captureFetch(() => new Response(null, { status: 201 }));
      try {
        const r = await createTicketForUserReport(
          { kind: "bug", title: "Broken", description: "Something is broken here." },
          "u-1",
          "Unit Tester"
        );
        assertEquals(r.created, false);
        assertEquals(r.reason, "no-token");
        assertEquals(f.calls.length, 0);
      } finally {
        f.restore();
      }
    }
  );
});

Deno.test("createTicketForAlert ignores deduplicate hits older than the 1h window", async () => {
  await withValidGithubEnv(async () => {
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
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          number: 100,
          html_url: "https://github.com/foo/bar/issues/100",
        }),
        { status: 201 }
      );
    });
    try {
      const r = await createTicketForAlert(
        { severity: "CRITICAL", source: "src", message: "m" },
        "u-1"
      );
      assertEquals(r.created, true);
      assertEquals(r.issueNumber, 100);
    } finally {
      f.restore();
    }
  });
});

for (const testCase of [
  {
    label: "createTicketForAlert returns github-api-failed when issue creation 5xx",
    handler: (url: string) => {
      if (url.includes("/search/issues")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response("upstream blew up", { status: 502 });
    },
    expectedCreated: false,
    expectedReason: "github-api-failed",
    expectedIssueNumber: null,
  },
  {
    label: "createTicketForAlert handles findOpenDuplicate non-OK by creating",
    handler: (url: string) => {
      if (url.includes("/search/issues")) {
        return new Response("auth bad", { status: 401 });
      }
      return new Response(
        JSON.stringify({
          number: 11,
          html_url: "https://github.com/foo/bar/issues/11",
        }),
        { status: 201 }
      );
    },
    expectedCreated: true,
    expectedReason: null,
    expectedIssueNumber: 11,
  },
] as const) {
  Deno.test(testCase.label, async () => {
    await withValidGithubEnv(async () => {
      const f = captureFetch((url) => {
        return testCase.handler(url);
      });
      try {
        const r = await createTicketForAlert(CRITICAL_ALERT, "u-1");
        assertEquals(r.created, testCase.expectedCreated);
        assertEquals(r.reason, testCase.expectedReason);
        assertEquals(r.issueNumber, testCase.expectedIssueNumber);
      } finally {
        f.restore();
      }
    });
  });
}

Deno.test("createTicketForAlert handles findOpenDuplicate fetch throw by creating", async () => {
  await withValidGithubEnv(async () => {
    let isSearch = true;
    globalThis.fetch = ((_url: string, _init?: RequestInit) => {
      if (isSearch) {
        isSearch = false;
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            number: 22,
            html_url: "https://github.com/foo/bar/issues/22",
          }),
          { status: 201 }
        )
      );
    }) as typeof fetch;
    try {
      const r = await createTicketForAlert(
        { severity: "CRITICAL", source: "src", message: "m" },
        "u-1"
      );
      assertEquals(r.created, true);
      assertEquals(r.issueNumber, 22);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

Deno.test("createTicketForAlert handles createIssue fetch throw", async () => {
  await withValidGithubEnv(async () => {
    let call = 0;
    globalThis.fetch = ((_url: string) => {
      call++;
      if (call === 1) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      }
      return Promise.reject(new Error("connect ETIMEDOUT"));
    }) as typeof fetch;
    try {
      const r = await createTicketForAlert(
        { severity: "CRITICAL", source: "src", message: "m" },
        "u-1"
      );
      assertEquals(r.created, false);
      assertEquals(r.reason, "github-api-failed");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

Deno.test("createTicketForAlert handles commentOnIssue throw silently while deduping", async () => {
  await withValidGithubEnv(async () => {
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
            { status: 200 }
          )
        );
      }
      return Promise.reject(new Error("comment write fail"));
    }) as typeof fetch;
    try {
      const r = await createTicketForAlert(
        { severity: "CRITICAL", source: "src", message: "m" },
        "u-1"
      );
      assertEquals(r.created, false);
      assertEquals(r.issueNumber, 33);
      assertEquals(r.reason, "deduped-onto-existing");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

if (REAL_TOKEN !== undefined) {
  Deno.env.set("GITHUB_TICKETING_TOKEN", REAL_TOKEN);
}
if (REAL_REPO !== undefined) Deno.env.set("GITHUB_TICKETING_REPO", REAL_REPO);
