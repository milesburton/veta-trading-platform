import { afterAll, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Promise<Response>;
type Rule = [RegExp, (params: unknown[]) => unknown[][]];

const h = vi.hoisted(() => ({
  handler: undefined as undefined | ((req: Request) => Promise<Response>),
  rules: [] as Array<[RegExp, (params: unknown[]) => unknown[][]]>,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  send: vi.fn(),
  released: 0,
}));

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () => Promise.resolve({ send: h.send }),
}));
vi.mock("#veta/db", () => ({
  usersPool: {
    connect: () =>
      Promise.resolve({
        queryArray: (sql: string, params: unknown[] = []) => {
          h.queries.push({ sql, params });
          const rule = h.rules.find(([pattern]) => pattern.test(sql));
          return Promise.resolve({ rows: rule ? rule[1](params) : [] });
        },
        release: () => {
          h.released += 1;
        },
      }),
  },
}));

vi.stubEnv("OAUTH2_SHARED_SECRET", "shared-secret-value");
vi.stubEnv("OAUTH2_USER_SECRETS", "alice:alice-secret;broken;:nothing;bob:");
vi.stubEnv(
  "OAUTH2_CLIENTS",
  "web:postmessage,http://cb|openid;auto|postmessage|openid,profile;;x:"
);
vi.stubEnv("INTERNAL_SERVICE_TOKEN", "svc-token");
vi.stubEnv("CORS_ALLOWED_ORIGINS", "http://app.test");
vi.stubEnv("VETA_DEMO_MODE", "true");
vi.stubEnv("PUBLIC_GUEST_TRADING", "true");
vi.stubEnv("OAUTH_ALLOW_PUBLIC_REGISTER", "true");

h.send.mockResolvedValue(undefined);

await import("../user-service/user-service.ts");
await vi.waitFor(() => assert(h.handler));

afterAll(() => {
  vi.unstubAllEnvs();
});

const when = (pattern: RegExp, rows: (params: unknown[]) => unknown[][]) => {
  h.rules.unshift([pattern, rows] as Rule);
};

const SESSION_SQL = /FROM users\.sessions s JOIN users\.users u/;
const LIMITS_SQL = /FROM users\.trading_limits WHERE user_id/;

const signInAs = (id: string, role: string) =>
  when(SESSION_SQL, () => [[id, id.toUpperCase(), role, "x", null]]);

const call = (
  path: string,
  init: { method?: string; body?: unknown; cookie?: boolean; headers?: Record<string, string> } = {}
): Promise<Response> => {
  const { method = "GET", body, cookie = true, headers = {} } = init;
  assert(h.handler);
  return h.handler(
    new Request(`http://users${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { ...(cookie ? { cookie: "veta_user=tok" } : {}), ...headers },
    })
  );
};

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

const pkceChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

beforeEach(() => {
  h.rules.length = 0;
  h.queries.length = 0;
  h.send.mockClear();
  h.released = 0;
});

test("[user-service] answers preflight, health, unknown routes and CORS", async () => {
  assertEquals((await call("/x", { method: "OPTIONS" })).status, 204);
  assertEquals((await json(await call("/health"))).status, "ok");
  assertEquals((await call("/missing")).status, 404);
  const cors = await call("/health", { headers: { origin: "http://app.test" } });
  assertEquals(cors.headers.get("access-control-allow-origin"), "http://app.test");
  const foreign = await call("/health", { headers: { origin: "http://evil.test" } });
  assertEquals(foreign.headers.get("access-control-allow-origin"), null);
});

test("[user-service] lists users only for admin and compliance sessions", async () => {
  assertEquals((await call("/users", { cookie: false })).status, 401);
  signInAs("t1", "trader");
  assertEquals((await call("/users")).status, 403);

  h.rules.length = 0;
  signInAs("a1", "admin");
  when(/FROM users\.users ORDER BY role/, () => [
    ["u1", "One", "trader", "x", "Firm"],
    ["u2", "Two", "viewer", "y", null],
  ]);
  const users = (await (await call("/users")).json()) as Array<{ firm: string | null }>;
  assertEquals(
    users.map((u) => u.firm),
    ["Firm", null]
  );
});

test("[user-service] serves demo personas with their passcodes", async () => {
  when(/FROM users\.users u\s+LEFT JOIN/, () => [
    ["alice", "Alice", "trader", "x", "desc", "high_touch", "equity", "LIMIT,TWAP", 5, true],
    ["carol", "Carol", "viewer", "y", null, null, null, null, null, null],
  ]);
  const body = (await json(await call("/personas", { cookie: false }))) as {
    personas: Array<Record<string, unknown>>;
  };
  assertEquals(body.personas[0].passcode, "alice-secret");
  assertEquals(body.personas[0].allowed_strategies, ["LIMIT", "TWAP"]);
  assertEquals(body.personas[1].passcode, "shared-secret-value");
  assertEquals(body.personas[1].max_order_qty, 0);
  assertEquals(body.personas[1].description, "");
});

test("[user-service] disables legacy session login and clears sessions on logout", async () => {
  assertEquals((await call("/sessions", { method: "POST" })).status, 410);

  when(/SELECT user_id FROM users\.sessions/, () => [["t1"]]);
  const res = await call("/sessions", { method: "DELETE" });
  assertEquals(res.status, 200);
  assert(res.headers.get("set-cookie")?.includes("Max-Age=0"));
  assert(h.queries.some((q) => q.sql.startsWith("DELETE FROM users.sessions")));
  assertEquals(h.send.mock.calls[0][1].event, "logout");

  h.queries.length = 0;
  assertEquals((await call("/sessions", { method: "DELETE", cookie: false })).status, 200);
  assertEquals(h.queries.length, 0);
});

test("[user-service] returns the current user with limits, defaults when none stored", async () => {
  assertEquals((await call("/sessions/me", { cookie: false })).status, 401);
  signInAs("t1", "trader");
  const defaults = await json(await call("/sessions/me"));
  assertEquals((defaults.limits as { max_order_qty: number }).max_order_qty, 10_000);

  when(LIMITS_SQL, () => [[50, 1000, "LIMIT, TWAP", "equity,fx", true, "low_touch", "fx"]]);
  const stored = await json(await call("/sessions/me"));
  assertEquals((stored.limits as { allowed_desks: string[] }).allowed_desks, ["equity", "fx"]);
});

test("[user-service] validates a posted session token", async () => {
  assertEquals(
    (await call("/sessions/validate", { method: "POST", body: { token: "x" } })).status,
    401
  );
  assertEquals(
    (await call("/sessions/validate", { method: "POST", body: { token: 5 } })).status,
    400
  );
  signInAs("t1", "trader");
  const ok = await json(await call("/sessions/validate", { method: "POST", body: { token: "x" } }));
  assertEquals((ok.user as { id: string }).id, "t1");
});

test("[user-service] limits reads are scoped to the caller unless the service token is used", async () => {
  assertEquals((await call("/users/t1/limits", { cookie: false })).status, 401);
  signInAs("t1", "trader");
  assertEquals((await call("/users/other/limits")).status, 403);

  when(LIMITS_SQL, () => [[50, 1000, "LIMIT", "equity", false, "high_touch", "eq"]]);
  const own = await json(await call("/users/t1/limits"));
  assertEquals(own.allowed_strategies, ["LIMIT"]);

  const viaService = await call("/users/other/limits", {
    cookie: false,
    headers: { "x-veta-service-token": "svc-token" },
  });
  assertEquals(viaService.status, 200);

  h.rules.length = 0;
  signInAs("r1", "risk-manager");
  assertEquals((await call("/users/missing/limits")).status, 404);
});

test("[user-service] limits updates are admin only, merge fields and are audited", async () => {
  assertEquals(
    (await call("/users/t1/limits", { method: "PUT", cookie: false, body: {} })).status,
    401
  );
  signInAs("t1", "trader");
  assertEquals((await call("/users/t1/limits", { method: "PUT", body: {} })).status, 403);

  h.rules.length = 0;
  signInAs("a1", "admin");
  assertEquals(
    (await call("/users/t1/limits", { method: "PUT", body: { max_order_qty: -1 } })).status,
    400
  );
  assertEquals((await call("/users/t1/limits", { method: "PUT", body: {} })).status, 404);

  when(
    /SELECT max_order_qty, max_daily_notional, allowed_strategies, allowed_desks, dark_pool_access FROM/,
    () => [[10, 100, "LIMIT", "equity", false]]
  );
  const res = await call("/users/t1/limits", {
    method: "PUT",
    body: { max_order_qty: 20, allowed_strategies: ["LIMIT", "VWAP"] },
  });
  assertEquals(res.status, 200);
  const update = h.queries.find((q) => q.sql.startsWith("UPDATE users.trading_limits"));
  assertEquals(update?.params, [20, 100, "LIMIT,VWAP", "equity", false, "t1"]);
  assert(h.queries.some((q) => q.sql.includes("INSERT INTO audit.events")));
  assertEquals(h.send.mock.calls.length, 0);
});

test("[user-service] preferences are readable, and writable by the owner or an admin", async () => {
  assertEquals((await call("/users/t1/preferences")).status, 404);
  when(/FROM users\.user_preferences/, () => [[null]]);
  assertEquals(await json(await call("/users/t1/preferences")), {});

  assertEquals(
    (await call("/users/t1/preferences", { method: "PUT", cookie: false, body: {} })).status,
    401
  );
  signInAs("t1", "trader");
  assertEquals((await call("/users/other/preferences", { method: "PUT", body: {} })).status, 403);
  assertEquals((await call("/users/t1/preferences", { method: "PUT", body: [] })).status, 400);
  assertEquals(
    (await call("/users/t1/preferences", { method: "PUT", body: { a: 1 } })).status,
    200
  );
  assertEquals(h.send.mock.calls[0][0], "user.preferences");
});

test("[user-service] shared workspaces can be listed, created, read and deleted", async () => {
  assertEquals((await call("/shared-workspaces", { cookie: false })).status, 401);
  signInAs("t1", "trader");
  const created = new Date("2026-01-01T00:00:00Z");
  when(
    /FROM users\.shared_workspaces sw JOIN users\.users u ON u\.id = sw\.owner_id\s+WHERE sw\.owner_id !=/,
    () => [["w1", "o1", "Owner", "x", "Layout", "d", created]]
  );
  const list = (await (await call("/shared-workspaces")).json()) as Array<{ createdAt: string }>;
  assertEquals(list[0].createdAt, created.toISOString());

  assertEquals(
    (await call("/shared-workspaces", { method: "POST", body: { name: "" } })).status,
    400
  );
  assertEquals(
    (await call("/shared-workspaces", { method: "POST", body: { name: "n", model: null } })).status,
    400
  );
  const made = await json(
    await call("/shared-workspaces", { method: "POST", body: { name: "n", model: { a: 1 } } })
  );
  assert(typeof made.id === "string");

  assertEquals((await call("/shared-workspaces/w1")).status, 404);
  when(/sw\.model_json, sw\.created_at/, () => [
    ["w1", "o1", "Owner", "x", "Layout", "d", { m: 1 }, created],
  ]);
  assertEquals((await json(await call("/shared-workspaces/w1"))).model, { m: 1 });
});

test("[user-service] only the owner or an admin may delete a shared workspace", async () => {
  assertEquals(
    (await call("/shared-workspaces/w1", { method: "DELETE", cookie: false })).status,
    401
  );
  signInAs("t1", "trader");
  assertEquals((await call("/shared-workspaces/w1", { method: "DELETE" })).status, 404);
  when(/SELECT owner_id FROM users\.shared_workspaces/, () => [["someone-else"]]);
  assertEquals((await call("/shared-workspaces/w1", { method: "DELETE" })).status, 403);

  h.rules.length = 0;
  signInAs("a1", "admin");
  when(/SELECT owner_id FROM users\.shared_workspaces/, () => [["someone-else"]]);
  assertEquals((await call("/shared-workspaces/w1", { method: "DELETE" })).status, 200);
});

test("[user-service] alerts are listed, created and dismissed for the owner", async () => {
  assertEquals((await call("/users/t1/alerts", { cookie: false })).status, 401);
  signInAs("t1", "trader");
  assertEquals((await call("/users/other/alerts")).status, 403);

  const ts = new Date(1_700_000_000_000);
  when(/FROM users\.user_alerts WHERE user_id=\$1 ORDER BY/, () => [
    ["a1", "warn", "oms", "msg", null, ts, true, ts],
    ["a2", "info", "oms", "msg", "more", 5, false, null],
  ]);
  const alerts = (await (await call("/users/t1/alerts")).json()) as Array<Record<string, unknown>>;
  assertEquals(alerts[0].ts, ts.getTime());
  assertEquals(alerts[0].dismissedAt, ts.getTime());
  assertEquals(alerts[1].dismissed, false);
  assertEquals(alerts[1].detail, "more");

  assertEquals((await call("/users/t1/alerts", { method: "POST", body: {} })).status, 400);
  assertEquals((await call("/users/other/alerts", { method: "POST", body: {} })).status, 403);
  const created = await json(
    await call("/users/t1/alerts", {
      method: "POST",
      body: { id: "fixed", severity: "warn", source: "oms", message: "m" },
    })
  );
  assertEquals(created.id, "fixed");
});

test("[user-service] dismisses one or all alerts for the owner", async () => {
  assertEquals(
    (await call("/users/t1/alerts/dismiss-all", { method: "PUT", cookie: false })).status,
    401
  );
  signInAs("t1", "trader");
  assertEquals((await call("/users/other/alerts/dismiss-all", { method: "PUT" })).status, 403);
  assertEquals((await call("/users/t1/alerts/dismiss-all", { method: "PUT" })).status, 200);

  assertEquals((await call("/users/other/alerts/a1/dismiss", { method: "PUT" })).status, 403);
  assertEquals((await call("/users/t1/alerts/a1/dismiss", { method: "PUT" })).status, 200);

  h.rules.length = 0;
  assertEquals((await call("/users/t1/alerts/a1/dismiss", { method: "PUT" })).status, 401);
});

test("[user-service] publishes OIDC discovery and the client list", async () => {
  const discovery = await json(await call("/.well-known/openid-configuration"));
  assertEquals(discovery.token_endpoint, "http://users/oauth/token");
  const clients = (await json(await call("/oauth/clients"))) as {
    clients: Array<{ client_id: string }>;
  };
  assertEquals(clients.clients.map((c) => c.client_id).sort(), ["auto", "web", "x"]);
});

const authorize = async (overrides: Record<string, unknown> = {}) => {
  when(/SELECT id FROM users\.users WHERE id = \$1/, (p) => (p[0] === "ghost" ? [] : [[p[0]]]));
  return call("/oauth/authorize", {
    method: "POST",
    cookie: false,
    body: {
      client_id: "web",
      username: "alice",
      password: "alice-secret",
      response_type: "code",
      code_challenge: await pkceChallenge("verifier"),
      code_challenge_method: "S256",
      ...overrides,
    },
  });
};

test("[user-service] authorize rejects unknown clients, missing users and bad credentials", async () => {
  assertEquals((await authorize({ client_id: "nope" })).status, 401);
  assertEquals((await authorize({ username: "", userId: undefined })).status, 400);
  assertEquals((await authorize({ password: "wrong" })).status, 401);
  assertEquals((await authorize({ password: "" })).status, 401);
  assertEquals(
    (await authorize({ username: "ghost", password: "shared-secret-value" })).status,
    404
  );
  assertEquals((await call("/oauth/authorize", { method: "POST", body: {} })).status, 400);
});

test("[user-service] accepts the shared secret for users without their own secret", async () => {
  const res = await authorize({
    username: "carol",
    password: "shared-secret-value",
    scope: " custom ",
  });
  assertEquals((await json(res)).scope, "custom");
});

test("[user-service] verifies stored password hashes before falling back to secrets", async () => {
  const { hashPassword } = await import("../user-service/credentials.ts");
  const hash = await hashPassword("a-long-password");
  when(/SELECT password_hash, auth_source FROM users\.users/, () => [[hash, "local"]]);
  assertEquals((await authorize({ username: "dave", password: "a-long-password" })).status, 200);
  assertEquals(
    (await authorize({ username: "dave", password: "shared-secret-value" })).status,
    401
  );
});

test("[user-service] exchanges a code for a session exactly once", async () => {
  const issued = await json(await authorize());
  const code = issued.code as string;
  when(/SELECT id, name, role, avatar_emoji, firm FROM users\.users WHERE id = \$1/, (p) => [
    [p[0], "Alice", "trader", "x", null],
  ]);
  const token = (overrides: Record<string, unknown> = {}) =>
    call("/oauth/token", {
      method: "POST",
      cookie: false,
      body: {
        client_id: "web",
        code,
        grant_type: "authorization_code",
        code_verifier: "verifier",
        ...overrides,
      },
    });

  assertEquals((await token({ code_verifier: "wrong" })).status, 400);
  const ok = await token();
  assertEquals(ok.status, 200);
  assert(ok.headers.get("set-cookie")?.includes("veta_user="));
  assertEquals(((await json(ok)).user as { id: string }).id, "alice");
  assertEquals((await token()).status, 400);
});

test("[user-service] rejects token requests for the wrong client or redirect", async () => {
  const code = (await json(await authorize())).code as string;
  const body = {
    code,
    grant_type: "authorization_code",
    code_verifier: "verifier",
  };
  const send = (extra: Record<string, unknown>) =>
    call("/oauth/token", { method: "POST", cookie: false, body: { ...body, ...extra } });
  assertEquals((await send({ client_id: "auto" })).status, 401);
  assertEquals((await send({ client_id: "web", redirect_uri: "http://cb" })).status, 401);
  assertEquals((await send({ client_id: "web", code: "unknown" })).status, 400);
});

test("[user-service] reports a token exchange for a vanished user", async () => {
  const code = (await json(await authorize())).code as string;
  const res = await call("/auth/token", {
    method: "POST",
    cookie: false,
    body: { client_id: "web", code, grant_type: "authorization_code", code_verifier: "verifier" },
  });
  assertEquals(res.status, 404);
});

test("[user-service] issues guest sessions only when guest mode is on", async () => {
  when(/SELECT id, name, role, avatar_emoji, firm FROM users\.users WHERE id = \$1/, (p) => [
    [p[0], p[0], "guest", "x", null],
  ]);
  const ok = await json(await call("/oauth/guest", { method: "POST", cookie: false }));
  assert(String((ok.user as { id: string }).id).startsWith("guest-"));

  h.rules.length = 0;
  assertEquals((await call("/oauth/guest", { method: "POST", cookie: false })).status, 500);

  vi.stubEnv("PUBLIC_GUEST_TRADING", "false");
  assertEquals((await call("/oauth/guest", { method: "POST", cookie: false })).status, 403);
  vi.stubEnv("PUBLIC_GUEST_TRADING", "true");
});

test("[user-service] registers a new trader with starter limits and audits it", async () => {
  const register = (body: Record<string, unknown>) =>
    call("/oauth/register", { method: "POST", cookie: false, body });
  const valid = {
    username: "New_User",
    name: " New ",
    password: "long-enough-pw",
    archetype: "equity-high-touch",
  };

  assertEquals((await register({ ...valid, username: "n" })).status, 400);
  assertEquals((await register({ ...valid, password: "short" })).status, 400);
  assertEquals((await register({ ...valid, archetype: "nope" })).status, 400);

  when(/SELECT id FROM users\.users WHERE id = \$1/, () => [["taken"]]);
  assertEquals((await register(valid)).status, 409);

  h.rules.length = 0;
  const created = await register(valid);
  assertEquals(created.status, 201);
  assertEquals((await json(created)).userId, "new_user");
  const topics = h.send.mock.calls.map((c) => c[0]);
  assertEquals(topics, ["user.session"]);
  assert(h.queries.some((q) => q.sql.includes("INSERT INTO audit.events")));
});

test("[user-service] registration can be switched off", async () => {
  vi.stubEnv("OAUTH_ALLOW_PUBLIC_REGISTER", "false");
  assertEquals(
    (await call("/auth/register", { method: "POST", cookie: false, body: {} })).status,
    403
  );
  vi.stubEnv("OAUTH_ALLOW_PUBLIC_REGISTER", "true");
});

test("[user-service] hides personas when demo mode is off", async () => {
  vi.stubEnv("VETA_DEMO_MODE", "false");
  assertEquals((await call("/personas")).status, 404);
  vi.stubEnv("VETA_DEMO_MODE", "true");
});

test("[user-service] releases every database connection it takes", async () => {
  signInAs("a1", "admin");
  await call("/users");
  await call("/sessions/me");
  assert(h.released >= 3);
});
