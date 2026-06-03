/**
 * Registration archetype persistence (testcontainers).
 *
 * Registers a new user with a chosen trader archetype against a real
 * user-service + Postgres, then logs in as that user and reads back their
 * trading_limits to assert the archetype's trading_style, primary_desk,
 * allowed_strategies and dark_pool_access were persisted. This is the test
 * that proves the /oauth/register archetype mapping reaches the database.
 *
 * Gated behind RUN_TESTCONTAINERS=1.
 */
import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { getTraderArchetype } from "@veta/trader-archetypes";
import { pkce } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 10_000) => AbortSignal.timeout(ms);

const PASSWORD = "register-test-passcode";

async function registerUser(
  us: string,
  username: string,
  archetype: string,
): Promise<Response> {
  return await fetch(`${us}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, name: username, password: PASSWORD, archetype }),
    signal: T(),
  });
}

async function loginWithPassword(us: string, username: string): Promise<string> {
  const { verifier, challenge } = await pkce();
  const auth = await fetch(`${us}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "veta-automation",
      username,
      redirect_uri: "postmessage",
      response_type: "code",
      scope: "openid profile",
      password: PASSWORD,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }),
    signal: T(),
  });
  assertEquals(auth.status, 200, `authorize for ${username} failed`);
  const { code } = await auth.json() as { code: string };
  const tok = await fetch(`${us}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "veta-automation",
      code,
      grant_type: "authorization_code",
      redirect_uri: "postmessage",
      code_verifier: verifier,
    }),
    signal: T(),
  });
  await tok.body?.cancel();
  assertEquals(tok.status, 200, `token exchange for ${username} failed`);
  const cookie = tok.headers.get("set-cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  assert(match, `no veta_user cookie for ${username}`);
  return match[1];
}

Deno.test({
  name: "registration (testcontainers): archetype persists to trading_limits",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack: TestStack = await startStack({
      services: ["user-service"],
      perServiceEnv: {
        "user-service": {
          OAUTH_ALLOW_PUBLIC_REGISTER: "true",
          VETA_ALLOW_DEFAULT_PASSCODE: "true",
        },
      },
    });
    try {
      const us = stack.urls["user-service"];
      assert(us, "user-service URL not in stack");

      await t.step("registers an FI voice trader and persists its profile", async () => {
        const archetype = getTraderArchetype("fi-voice");
        assert(archetype, "fi-voice archetype must exist");

        const username = "tc-fi-voice";
        const reg = await registerUser(us, username, "fi-voice");
        assertEquals(reg.status, 201, "registration should succeed");
        const regBody = await reg.json() as { archetype?: string };
        assertEquals(regBody.archetype, "fi-voice");

        const token = await loginWithPassword(us, username);
        const limitsRes = await fetch(`${us}/users/${username}/limits`, {
          headers: { Cookie: `veta_user=${token}` },
          signal: T(),
        });
        assertEquals(limitsRes.status, 200, "should read own limits");
        const limits = await limitsRes.json() as {
          trading_style: string;
          primary_desk: string;
          allowed_strategies: string[];
          allowed_desks: string[];
          dark_pool_access: boolean;
        };

        assertEquals(limits.trading_style, archetype.tradingStyle);
        assertEquals(limits.primary_desk, archetype.primaryDesk);
        assertEquals(limits.dark_pool_access, archetype.darkPoolAccess);
        assertEquals(
          limits.allowed_strategies.sort(),
          archetype.allowedStrategies.split(",").sort(),
        );
      });

      await t.step("registers an FX electronic trader with dark-pool access", async () => {
        const archetype = getTraderArchetype("fx-electronic");
        assert(archetype, "fx-electronic archetype must exist");

        const username = "tc-fx-elec";
        const reg = await registerUser(us, username, "fx-electronic");
        assertEquals(reg.status, 201);
        await reg.body?.cancel();

        const token = await loginWithPassword(us, username);
        const limitsRes = await fetch(`${us}/users/${username}/limits`, {
          headers: { Cookie: `veta_user=${token}` },
          signal: T(),
        });
        assertEquals(limitsRes.status, 200);
        const limits = await limitsRes.json() as {
          trading_style: string;
          dark_pool_access: boolean;
        };
        assertEquals(limits.trading_style, "fx_electronic");
        assertEquals(limits.dark_pool_access, true, "fx-electronic has dark-pool access");
      });

      await t.step("rejects registration with an unknown archetype", async () => {
        const reg = await registerUser(us, "tc-bogus", "not-a-real-archetype");
        assert(reg.status === 400, `expected 400, got ${reg.status}`);
        await reg.body?.cancel();
      });

      await t.step("rejects registration with no archetype", async () => {
        const reg = await fetch(`${us}/oauth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "tc-noarch", name: "No Arch", password: PASSWORD }),
          signal: T(),
        });
        assert(reg.status === 400, `expected 400, got ${reg.status}`);
        await reg.body?.cancel();
      });
    } finally {
      await stack.teardown();
    }
  },
});
