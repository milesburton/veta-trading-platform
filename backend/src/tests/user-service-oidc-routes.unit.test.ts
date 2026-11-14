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
  tokenResponse: undefined as undefined | (() => Response),
  jwks: [] as unknown[],
  backChannel: [] as string[],
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
        release: () => {},
      }),
  },
}));

const ISSUER = "https://veta.test/sso/application/o/veta/";
vi.stubEnv("OAUTH2_SHARED_SECRET", "shared-secret-value");
vi.stubEnv("OIDC_ENABLED", "true");
vi.stubEnv("OIDC_ISSUER", ISSUER);
vi.stubEnv("OIDC_INTERNAL_BASE_URL", "http://idp:9000/sso");
vi.stubEnv("OIDC_APPLICATION_SLUG", "veta");
vi.stubEnv("OIDC_CLIENT_ID", "veta-platform");
vi.stubEnv("OIDC_CLIENT_SECRET", "client-secret-0123456789");
vi.stubEnv("OIDC_REDIRECT_URI", "https://veta.test/");

vi.stubGlobal("fetch", (url: string) => {
  h.backChannel.push(url);
  if (url.endsWith("/application/o/token/")) {
    return Promise.resolve(h.tokenResponse ? h.tokenResponse() : new Response("", { status: 400 }));
  }
  if (url.endsWith("/jwks/")) return Promise.resolve(Response.json({ keys: h.jwks }));
  return Promise.reject(new Error(`unexpected fetch ${url}`));
});

h.send.mockResolvedValue(undefined);

await import("../user-service/user-service.ts");
await vi.waitFor(() => assert(h.handler));

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const encode = (value: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(value)));

const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"]
);
const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
h.jwks = [{ kty: "RSA", kid: "k1", n: publicJwk.n, e: publicJwk.e, use: "sig" }];

const signIdToken = async (claims: Record<string, unknown>): Promise<string> => {
  const signedPart = `${encode({ alg: "RS256", kid: "k1" })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(signedPart)
  );
  return `${signedPart}.${b64url(new Uint8Array(signature))}`;
};

const call = (method: string, path: string, body?: unknown, cookie?: string): Promise<Response> => {
  const handler = h.handler;
  if (!handler) throw new Error("handler not registered");
  return handler(
    new Request(`http://user-service${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
};

const when = (pattern: RegExp, rows: (params: unknown[]) => unknown[][]) => {
  h.rules.unshift([pattern, rows] as Rule);
};

const USER_LOOKUP = /SELECT role, auth_source FROM users\.users WHERE id = \$1 FOR UPDATE/;
const SESSION_USER = /SELECT id, name, role, avatar_emoji, firm FROM users\.users/;

const start = async () => {
  const res = await call("POST", "/oauth/oidc/start");
  const { authorization_url: authorizationUrl } = (await res.json()) as {
    authorization_url: string;
  };
  const url = new URL(authorizationUrl);
  const state = url.searchParams.get("state") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  return { res, url, state, nonce, cookie: `veta_oidc_state=${state}` };
};

const idTokenFor = (nonce: string, overrides: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return signIdToken({
    iss: ISSUER,
    aud: "veta-platform",
    sub: "carol",
    preferred_username: "carol",
    name: "Carol Example",
    exp: now + 300,
    iat: now,
    nonce,
    amr: ["pwd", "mfa"],
    groups: ["veta-trader"],
    ...overrides,
  });
};

const completeSignIn = async (overrides: Record<string, unknown> = {}) => {
  const { state, nonce, cookie } = await start();
  const idToken = await idTokenFor(nonce, overrides);
  h.tokenResponse = () => Response.json({ id_token: idToken });
  return call("POST", "/oauth/oidc/callback", { code: "auth-code", state }, cookie);
};

const sqlMatching = (pattern: RegExp) => h.queries.filter(({ sql }) => pattern.test(sql));

beforeEach(() => {
  h.rules.length = 0;
  h.queries.length = 0;
  h.backChannel.length = 0;
  h.tokenResponse = undefined;
});

test("[oidc-routes] config reports single sign-on as enabled", async () => {
  const res = await call("GET", "/oauth/oidc/config");
  assertEquals(await res.json(), { enabled: true });
});

test("[oidc-routes] start returns the provider URL and binds the state to the browser", async () => {
  const { res, url, state } = await start();
  assertEquals(res.status, 200);
  assertEquals(`${url.origin}${url.pathname}`, "https://veta.test/sso/application/o/authorize/");
  assertEquals(url.searchParams.get("redirect_uri"), "https://veta.test/");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert(setCookie.startsWith(`veta_oidc_state=${state};`));
  assert(setCookie.includes("HttpOnly"));
  assert(setCookie.includes("Max-Age=600"));
});

test("[oidc-routes] first sign-in provisions an externally authenticated user and a session", async () => {
  when(SESSION_USER, () => [["carol", "Carol Example", "trader", "🔐", null]]);
  const res = await completeSignIn();
  assertEquals(res.status, 200);
  const body = (await res.json()) as { user: { id: string; role: string }; access_token: string };
  assertEquals(body.user, {
    id: "carol",
    name: "Carol Example",
    role: "trader",
    avatar_emoji: "🔐",
    firm: null,
  } as unknown as typeof body.user);
  assert((res.headers.get("set-cookie") ?? "").startsWith(`veta_user=${body.access_token};`));

  const [insert] = sqlMatching(/INSERT INTO users\.users/);
  assert(insert.sql.includes("'oidc'"));
  assertEquals(insert.params, ["carol", "Carol Example", "trader"]);
  assertEquals(sqlMatching(/INSERT INTO users\.trading_limits \(user_id\)/).length, 1);
  assertEquals(sqlMatching(/INSERT INTO users\.sessions/).length, 1);
  assertEquals(sqlMatching(/^COMMIT$/).length, 1);
  const audit = h.queries.find(({ params }) => params.includes("account_oidc_sign_in"));
  assert(audit);
  assert(h.backChannel.includes("http://idp:9000/sso/application/o/token/"));
});

test("[oidc-routes] a returning user has the role refreshed and old sessions ended on change", async () => {
  when(USER_LOOKUP, () => [["trader", "oidc"]]);
  when(SESSION_USER, () => [["carol", "Carol Example", "admin", "🔐", null]]);
  const res = await completeSignIn({ groups: ["veta-admin"] });
  assertEquals(res.status, 200);
  const [update] = sqlMatching(/UPDATE users\.users SET role/);
  assertEquals(update.params, ["carol", "admin", "Carol Example"]);
  assertEquals(sqlMatching(/DELETE FROM users\.sessions WHERE user_id/).length, 1);
  assertEquals(sqlMatching(/INSERT INTO users\.users/).length, 0);
});

test("[oidc-routes] a returning user with the same role keeps existing sessions", async () => {
  when(USER_LOOKUP, () => [["trader", "oidc"]]);
  when(SESSION_USER, () => [["carol", "Carol Example", "trader", "🔐", null]]);
  const res = await completeSignIn();
  assertEquals(res.status, 200);
  assertEquals(sqlMatching(/DELETE FROM users\.sessions WHERE user_id/).length, 0);
});

test("[oidc-routes] a name already held by a local account is refused", async () => {
  when(USER_LOOKUP, () => [["admin", "local"]]);
  const res = await completeSignIn({ preferred_username: "admin", sub: "admin" });
  assertEquals(res.status, 409);
  assertEquals(sqlMatching(/INSERT INTO users\.sessions/).length, 0);
  assertEquals(sqlMatching(/^ROLLBACK$/).length, 1);
  assertEquals(res.headers.get("set-cookie"), null);
});

test("[oidc-routes] the state must match the browser cookie and is single use", async () => {
  const { state, nonce, cookie } = await start();
  const idToken = await idTokenFor(nonce);
  h.tokenResponse = () => Response.json({ id_token: idToken });

  const noCookie = await call("POST", "/oauth/oidc/callback", { code: "c", state });
  assertEquals(noCookie.status, 400);
  const replay = await call("POST", "/oauth/oidc/callback", { code: "c", state }, cookie);
  assertEquals(replay.status, 400);
  assertEquals(h.backChannel.length, 0);

  const other = await start();
  const mismatch = await call(
    "POST",
    "/oauth/oidc/callback",
    { code: "c", state: other.state },
    cookie
  );
  assertEquals(mismatch.status, 400);
});

test("[oidc-routes] an unknown state is refused without contacting the provider", async () => {
  const state = "x".repeat(43);
  const res = await call(
    "POST",
    "/oauth/oidc/callback",
    { code: "c", state },
    `veta_oidc_state=${state}`
  );
  assertEquals(res.status, 400);
  assertEquals(h.backChannel.length, 0);
});

test("[oidc-routes] a sign-in without a second factor creates no session", async () => {
  const res = await completeSignIn({ amr: ["pwd"] });
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "invalid_id_token" });
  assertEquals(sqlMatching(/INSERT INTO users\./).length, 0);
});

test("[oidc-routes] a token for another audience creates no session", async () => {
  const res = await completeSignIn({ aud: "someone-else" });
  assertEquals(res.status, 401);
  assertEquals(sqlMatching(/INSERT INTO users\./).length, 0);
});

test("[oidc-routes] a provider failure is reported as a gateway error", async () => {
  const { state, cookie } = await start();
  h.tokenResponse = () => new Response("", { status: 500 });
  const res = await call("POST", "/oauth/oidc/callback", { code: "c", state }, cookie);
  assertEquals(res.status, 502);
  assertEquals(sqlMatching(/INSERT INTO users\./).length, 0);
});

test("[oidc-routes] a user name that cannot be a platform identifier is refused", async () => {
  const res = await completeSignIn({ preferred_username: "carol@example.com" });
  assertEquals(res.status, 400);
  assertEquals(sqlMatching(/INSERT INTO users\./).length, 0);
});

test("[oidc-routes] the callback body is validated", async () => {
  const res = await call("POST", "/oauth/oidc/callback", { code: "", state: "short" });
  assertEquals(res.status, 400);
});

test("[oidc-routes] local sign-in is refused for an externally authenticated user", async () => {
  when(/SELECT password_hash, auth_source, role FROM users\.users/, () => [
    [null, "oidc", "trader"],
  ]);
  const res = await call("POST", "/oauth/authorize", {
    client_id: "veta-web",
    username: "carol",
    password: "shared-secret-value",
    response_type: "code",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
  });
  assertEquals(res.status, 401);
});

test("[oidc-routes] local sign-in with the shared passcode still works for a local user", async () => {
  when(/SELECT password_hash, auth_source, role FROM users\.users/, () => [
    [null, "local", "trader"],
  ]);
  when(/SELECT id FROM users\.users WHERE id = \$1/, () => [["alice"]]);
  const res = await call("POST", "/oauth/authorize", {
    client_id: "veta-web",
    username: "alice",
    password: "shared-secret-value",
    response_type: "code",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
  });
  assertEquals(res.status, 200);
});
