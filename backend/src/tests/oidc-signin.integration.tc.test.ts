import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = process.env.RUN_TESTCONTAINERS === "1";
const ISSUER = `https://idp.veta.test/application/o/veta/`;
const CLIENT_ID = "veta-tc-client";
const SLUG = "veta";
const T = (ms = 10_000) => AbortSignal.timeout(ms);

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

interface FakeIdp {
  server: Server;
  port: number;
  issue: (claims: Record<string, unknown>) => Promise<string>;
  authorise: (code: string, claims: Record<string, unknown>) => void;
}

async function startFakeIdp(): Promise<FakeIdp> {
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
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = "tc-key";

  const issue = async (claims: Record<string, unknown>): Promise<string> => {
    const header = base64Url(JSON.stringify({ alg: "RS256", kid }));
    const payload = base64Url(JSON.stringify(claims));
    const signed = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(signed)
    );
    return `${signed}.${base64Url(new Uint8Array(signature))}`;
  };

  const codes = new Map<string, Record<string, unknown>>();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === `/application/o/${SLUG}/jwks/`) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: [{ ...jwk, kid, use: "sig", alg: "RS256" }] }));
      return;
    }
    if (url.pathname === "/application/o/token/" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", async () => {
        const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
        const claims = codes.get(form.get("code") ?? "");
        if (!claims || form.get("client_id") !== CLIENT_ID || !form.get("code_verifier")) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ id_token: await issue(claims) }));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    port: (server.address() as AddressInfo).port,
    issue,
    authorise: (code, claims) => {
      codes.set(code, claims);
    },
  };
}

interface StartResult {
  state: string;
  nonce: string;
  cookie: string;
}

async function startSignIn(us: string): Promise<StartResult> {
  const res = await fetch(`${us}/oauth/oidc/start`, { method: "POST", signal: T() });
  const raw = await res.text();
  assertEquals(res.status, 200, `oidc start should succeed: ${raw}`);
  const body = JSON.parse(raw) as { authorization_url: string };
  const url = new URL(body.authorization_url);
  assertEquals(url.searchParams.get("client_id"), CLIENT_ID);
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  const state = url.searchParams.get("state") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  assert(state.length > 20 && nonce.length > 20, "state and nonce should be unguessable");
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert(setCookie.includes(`veta_oidc_state=${state}`), "state is bound to the browser");
  return { state, nonce, cookie: `veta_oidc_state=${state}` };
}

function claimsFor(
  nonce: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "sso-subject-1",
    preferred_username: "sso-carol",
    name: "Carol Single",
    groups: ["veta-trader"],
    amr: ["pwd", "mfa"],
    nonce,
    iat: now,
    exp: now + 300,
    ...overrides,
  };
}

async function callback(
  us: string,
  start: StartResult,
  code: string
): Promise<{ res: Response; body: Record<string, unknown> }> {
  const res = await fetch(`${us}/oauth/oidc/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: start.cookie },
    body: JSON.stringify({ code, state: start.state }),
    signal: T(),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

function sessionCookie(res: Response): string {
  const match = /veta_user=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  return match?.[1] ?? "";
}

test({
  name: "oidc sign-in (testcontainers): provider, user-service, Postgres and gateway agree",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const idp = await startFakeIdp();
    let stack: TestStack | null = null;
    try {
      stack = await startStack({
        services: ["user-service", "gateway"],
        startupTimeoutMs: 60_000,
        perServiceEnv: {
          "user-service": {
            OIDC_ENABLED: "true",
            OIDC_ISSUER: ISSUER,
            OIDC_INTERNAL_BASE_URL: `http://127.0.0.1:${idp.port}`,
            OIDC_APPLICATION_SLUG: SLUG,
            OIDC_CLIENT_ID: CLIENT_ID,
            OIDC_CLIENT_SECRET: "tc-client-secret-0123456789",
            OIDC_REDIRECT_URI: "http://localhost:5173/sso/callback",
          },
        },
      });
      const us = stack.urls["user-service"] ?? "";
      const gw = stack.urls.gateway ?? "";
      let firstCookie = "";

      await t.step("user-service reports single sign-on as enabled", async () => {
        const res = await fetch(`${us}/oauth/oidc/config`, { signal: T() });
        assertEquals(((await res.json()) as { enabled: boolean }).enabled, true);
      });

      await t.step(
        "a first sign-in provisions the user and the gateway accepts its session",
        async () => {
          const start = await startSignIn(us);
          idp.authorise("code-1", claimsFor(start.nonce));
          const { res, body } = await callback(us, start, "code-1");
          assertEquals(res.status, 200, JSON.stringify(body));
          const user = body.user as { id: string; role: string };
          assertEquals(user.id, "sso-carol");
          assertEquals(user.role, "trader");
          firstCookie = sessionCookie(res);
          assert(firstCookie.length > 20, "a session cookie should be issued");

          const me = await fetch(`${gw}/me`, {
            headers: { Cookie: `veta_user=${firstCookie}` },
            signal: T(),
          });
          assertEquals(me.status, 200, "gateway should accept the session issued after sign-in");
          const profile = (await me.json()) as { user: { id: string; role: string } };
          assertEquals(profile.user.id, "sso-carol");
          assertEquals(profile.user.role, "trader");
        }
      );

      await t.step("the authorisation state is single use", async () => {
        const start = await startSignIn(us);
        idp.authorise("code-2", claimsFor(start.nonce));
        const first = await callback(us, start, "code-2");
        assertEquals(first.res.status, 200);
        const replay = await callback(us, start, "code-2");
        assertEquals(replay.res.status, 400);
      });

      await t.step("a callback without the browser state cookie is refused", async () => {
        const start = await startSignIn(us);
        idp.authorise("code-3", claimsFor(start.nonce));
        const res = await fetch(`${us}/oauth/oidc/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "code-3", state: start.state }),
          signal: T(),
        });
        assertEquals(res.status, 400);
        await res.body?.cancel();
      });

      await t.step("a sign-in without a second factor creates no session", async () => {
        const start = await startSignIn(us);
        idp.authorise(
          "code-4",
          claimsFor(start.nonce, { amr: ["pwd"], preferred_username: "sso-nomfa" })
        );
        const { res } = await callback(us, start, "code-4");
        assertEquals(res.status, 401);
        assertEquals(sessionCookie(res), "");
      });

      await t.step("a token for another audience or issuer is refused", async () => {
        const wrongAudience = await startSignIn(us);
        idp.authorise("code-5", claimsFor(wrongAudience.nonce, { aud: "someone-else" }));
        assertEquals((await callback(us, wrongAudience, "code-5")).res.status, 401);

        const wrongIssuer = await startSignIn(us);
        idp.authorise("code-6", claimsFor(wrongIssuer.nonce, { iss: "https://evil.test" }));
        assertEquals((await callback(us, wrongIssuer, "code-6")).res.status, 401);
      });

      await t.step("a token carrying another nonce is refused", async () => {
        const start = await startSignIn(us);
        idp.authorise("code-7", claimsFor("not-the-nonce-we-issued"));
        assertEquals((await callback(us, start, "code-7")).res.status, 401);
      });

      await t.step("a role change on the provider ends the user's earlier sessions", async () => {
        const start = await startSignIn(us);
        idp.authorise("code-8", claimsFor(start.nonce, { groups: ["veta-admin"] }));
        const { res, body } = await callback(us, start, "code-8");
        assertEquals(res.status, 200, JSON.stringify(body));
        assertEquals((body.user as { role: string }).role, "admin");

        const stale = await fetch(`${us}/sessions/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: firstCookie }),
          signal: T(),
        });
        assert(
          stale.status === 401 || stale.status === 404,
          `the pre-change session should be revoked at the user-service, got ${stale.status}`
        );
        await stale.body?.cancel();

        const fresh = await fetch(`${gw}/me`, {
          headers: { Cookie: `veta_user=${sessionCookie(res)}` },
          signal: T(),
        });
        assertEquals(fresh.status, 200);
        await fresh.body?.cancel();
      });

      await t.step(
        "an externally authenticated user cannot sign in with the shared passcode",
        async () => {
          const res = await fetch(`${us}/oauth/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: "veta-automation",
              username: "sso-carol",
              redirect_uri: "postmessage",
              response_type: "code",
              scope: "openid profile",
              password: "veta-dev-passcode",
              code_challenge: "x".repeat(43),
              code_challenge_method: "S256",
            }),
            signal: T(),
          });
          assert(res.status === 401 || res.status === 403, `expected refusal, got ${res.status}`);
          await res.body?.cancel();
        }
      );
    } finally {
      if (stack) await stack.teardown();
      await new Promise<void>((resolve) => idp.server.close(() => resolve()));
    }
  },
});
