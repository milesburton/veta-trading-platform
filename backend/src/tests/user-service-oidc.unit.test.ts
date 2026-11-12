import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import {
  buildAuthorizationUrl,
  createJwksClient,
  createPendingStore,
  exchangeCode,
  IdTokenError,
  type Jwk,
  type OidcConfig,
  parseJwks,
  pkceChallenge,
  randomUrlToken,
  readOidcConfig,
  roleFromGroups,
  userIdFromClaims,
  verifyIdToken,
} from "../user-service/oidc.ts";

const CONFIG: OidcConfig = {
  issuer: "https://veta.test/sso/application/o/veta/",
  internalBaseUrl: "http://idp:9000/sso",
  applicationSlug: "veta",
  clientId: "veta-platform",
  clientSecret: "client-secret-0123456789",
  redirectUri: "https://veta.test/",
  requireMfa: true,
};
const NOW = 1_800_000_000;

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const encode = (value: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(value)));

const makeKey = async (kid: string) => {
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
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const jwk: Jwk = { kty: "RSA", kid, n: exported.n ?? "", e: exported.e ?? "", use: "sig" };
  return { privateKey: pair.privateKey, jwk };
};

const SIGNER = await makeKey("key-1");
const OTHER = await makeKey("key-2");

const baseClaims = {
  iss: CONFIG.issuer,
  aud: CONFIG.clientId,
  sub: "alice",
  exp: NOW + 300,
  iat: NOW,
  nonce: "nonce-1",
  amr: ["pwd", "mfa"],
  preferred_username: "alice",
  name: "Alice Example",
  groups: ["veta-trader"],
};

const sign = async (
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "key-1" },
  key: CryptoKey = SIGNER.privateKey
): Promise<string> => {
  const signedPart = `${encode(header)}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signedPart)
  );
  return `${signedPart}.${b64url(new Uint8Array(signature))}`;
};

const verify = (token: string, overrides: Partial<Parameters<typeof verifyIdToken>[1]> = {}) =>
  verifyIdToken(token, {
    config: CONFIG,
    keys: [SIGNER.jwk],
    expectedNonce: "nonce-1",
    nowSeconds: NOW,
    ...overrides,
  });

const rejection = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (err) {
    assert(err instanceof IdTokenError, `expected IdTokenError, got ${String(err)}`);
    return err.message;
  }
  throw new Error("expected the token to be rejected");
};

test("[oidc] configuration is absent unless explicitly enabled", () => {
  assertEquals(readOidcConfig({}), null);
  assertEquals(readOidcConfig({ OIDC_ENABLED: "false", OIDC_ISSUER: CONFIG.issuer }), null);
});

test("[oidc] enabled configuration is read and normalised", () => {
  const config = readOidcConfig({
    OIDC_ENABLED: "TRUE",
    OIDC_ISSUER: CONFIG.issuer,
    OIDC_INTERNAL_BASE_URL: "http://idp:9000/sso/",
    OIDC_APPLICATION_SLUG: "veta",
    OIDC_CLIENT_ID: CONFIG.clientId,
    OIDC_CLIENT_SECRET: CONFIG.clientSecret,
    OIDC_REDIRECT_URI: CONFIG.redirectUri,
  });
  assertEquals(config, CONFIG);
});

test("[oidc] enabling with an incomplete configuration fails loudly", () => {
  let message = "";
  try {
    readOidcConfig({ OIDC_ENABLED: "true", OIDC_ISSUER: CONFIG.issuer });
  } catch (err) {
    message = (err as Error).message;
  }
  assert(message.includes("OIDC_CLIENT_SECRET"));
});

test("[oidc] the second factor requirement can only be relaxed explicitly", () => {
  const env = {
    OIDC_ENABLED: "true",
    OIDC_ISSUER: CONFIG.issuer,
    OIDC_INTERNAL_BASE_URL: CONFIG.internalBaseUrl,
    OIDC_APPLICATION_SLUG: "veta",
    OIDC_CLIENT_ID: CONFIG.clientId,
    OIDC_CLIENT_SECRET: CONFIG.clientSecret,
    OIDC_REDIRECT_URI: CONFIG.redirectUri,
  };
  assertEquals(readOidcConfig(env)?.requireMfa, true);
  assertEquals(readOidcConfig({ ...env, OIDC_REQUIRE_MFA: "false" })?.requireMfa, false);
});

test("[oidc] the authorisation URL uses the public provider root with PKCE", async () => {
  const challenge = await pkceChallenge("verifier");
  const url = new URL(
    buildAuthorizationUrl(CONFIG, { state: "s", nonce: "n", codeChallenge: challenge })
  );
  assertEquals(`${url.origin}${url.pathname}`, "https://veta.test/sso/application/o/authorize/");
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("client_id"), "veta-platform");
  assertEquals(url.searchParams.get("redirect_uri"), "https://veta.test/");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  assertEquals(url.searchParams.get("code_challenge"), challenge);
  assertEquals(url.searchParams.get("state"), "s");
  assertEquals(url.searchParams.get("nonce"), "n");
});

test("[oidc] an issuer that does not match the application slug is refused", () => {
  let message = "";
  try {
    buildAuthorizationUrl(
      { ...CONFIG, issuer: "https://veta.test/sso/" },
      { state: "s", nonce: "n", codeChallenge: "c" }
    );
  } catch (err) {
    message = (err as Error).message;
  }
  assert(message.includes("OIDC_ISSUER must end with"));
});

test("[oidc] the PKCE challenge matches the RFC 7636 example", async () => {
  assertEquals(
    await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  );
});

test("[oidc] random tokens are URL safe and distinct", () => {
  const a = randomUrlToken();
  const b = randomUrlToken();
  assert(/^[A-Za-z0-9_-]{43}$/.test(a));
  assert(a !== b);
});

test("[oidc] a correctly signed token with a second factor is accepted", async () => {
  const claims = await verify(await sign(baseClaims));
  assertEquals(claims.sub, "alice");
  assertEquals(claims.groups, ["veta-trader"]);
});

test("[oidc] an audience list containing the client is accepted", async () => {
  const claims = await verify(await sign({ ...baseClaims, aud: ["other", CONFIG.clientId] }));
  assertEquals(claims.sub, "alice");
});

test("[oidc] a token signed by another key is rejected", async () => {
  const token = await sign(baseClaims, { alg: "RS256", kid: "key-1" }, OTHER.privateKey);
  assertEquals(await rejection(verify(token)), "signature does not verify");
});

test("[oidc] a token naming a key that is not published is rejected", async () => {
  const token = await sign(baseClaims, { alg: "RS256", kid: "key-9" });
  assertEquals(await rejection(verify(token)), "signature does not verify");
});

test("[oidc] unsigned and symmetric algorithms are rejected", async () => {
  const none = `${encode({ alg: "none" })}.${encode(baseClaims)}.`;
  assertEquals(await rejection(verify(none)), "unsupported signing algorithm");
  const hmac = await sign(baseClaims, { alg: "HS256", kid: "key-1" });
  assertEquals(await rejection(verify(hmac)), "unsupported signing algorithm");
});

test("[oidc] a tampered payload is rejected", async () => {
  const [header, , signature] = (await sign(baseClaims)).split(".");
  const forged = `${header}.${encode({ ...baseClaims, groups: ["veta-admin"] })}.${signature}`;
  assertEquals(await rejection(verify(forged)), "signature does not verify");
});

test("[oidc] malformed tokens are rejected", async () => {
  assertEquals(await rejection(verify("not-a-jwt")), "token is not a signed JWT");
  assertEquals(await rejection(verify("%%%.%%%.%%%")), "malformed token segment");
});

test("[oidc] claim checks reject the wrong issuer, audience, nonce and times", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ iss: "http://idp:9000/sso/application/o/veta/" }, "issuer mismatch"],
    [{ aud: "another-client" }, "audience mismatch"],
    [{ nonce: "nonce-2" }, "nonce mismatch"],
    [{ nonce: undefined }, "nonce mismatch"],
    [{ exp: NOW - 120, iat: NOW - 400 }, "token expired"],
    [{ iat: NOW + 300, exp: NOW + 600 }, "token issued in the future"],
    [{ iat: NOW - 900, exp: NOW + 300 }, "token too old"],
    [{ sub: undefined }, "required claims are missing"],
  ];
  const messages = await Promise.all(
    cases.map(async ([override]) => rejection(verify(await sign({ ...baseClaims, ...override }))))
  );
  assertEquals(
    messages,
    cases.map(([, expected]) => expected)
  );
});

test("[oidc] a sign-in without a second factor is rejected unless relaxed", async () => {
  const passwordOnly = await sign({ ...baseClaims, amr: ["pwd"] });
  const noAmr = await sign({ ...baseClaims, amr: undefined });
  assertEquals(await rejection(verify(passwordOnly)), "sign-in did not use a second factor");
  assertEquals(await rejection(verify(noAmr)), "sign-in did not use a second factor");
  const relaxed = await verify(passwordOnly, { config: { ...CONFIG, requireMfa: false } });
  assertEquals(relaxed.sub, "alice");
});

test("[oidc] roles follow group precedence and default to viewer", () => {
  assertEquals(roleFromGroups(["veta-trader", "veta-admin"]), "admin");
  assertEquals(roleFromGroups(["veta-sales", "veta-trader"]), "trader");
  assertEquals(roleFromGroups(["veta-risk-manager", "veta-desk-head"]), "risk-manager");
  assertEquals(roleFromGroups(["authentik Admins", "admin", "veta-guest"]), "viewer");
  assertEquals(roleFromGroups([]), "viewer");
  assertEquals(roleFromGroups(undefined), "viewer");
});

test("[oidc] user identifiers are normalised and unsafe names refused", () => {
  const claims = (overrides: Record<string, unknown>) => ({ ...baseClaims, ...overrides });
  assertEquals(userIdFromClaims(claims({ preferred_username: " Alice " })), "alice");
  assertEquals(userIdFromClaims(claims({ preferred_username: undefined, sub: "bob_1" })), "bob_1");
  assertEquals(userIdFromClaims(claims({ preferred_username: "a" })), null);
  assertEquals(userIdFromClaims(claims({ preferred_username: "alice@example.com" })), null);
  assertEquals(userIdFromClaims(claims({ preferred_username: "al ice" })), null);
});

test("[oidc] published keys are filtered to RSA signing keys", () => {
  const keys = parseJwks({
    keys: [
      SIGNER.jwk,
      { kty: "EC", crv: "P-256", x: "x", y: "y" },
      { ...OTHER.jwk, use: "enc" },
      { kty: "RSA", n: "", e: "AQAB" },
    ],
  });
  assertEquals(
    keys.map((key) => key.kid),
    ["key-1"]
  );
});

test("[oidc] the code exchange posts to the internal endpoint with the public host forwarded", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(Response.json({ id_token: "the-token", access_token: "ignored" }));
  }) as unknown as typeof fetch;
  assertEquals(await exchangeCode(CONFIG, "code-1", "verifier-1", fakeFetch), "the-token");
  const [{ url, init }] = calls;
  const headers = init.headers as Record<string, string>;
  const body = init.body as URLSearchParams;
  assertEquals(url, "http://idp:9000/sso/application/o/token/");
  assertEquals(init.method, "POST");
  assertEquals(init.redirect, "error");
  assertEquals(headers["X-Forwarded-Host"], "veta.test");
  assertEquals(headers["X-Forwarded-Proto"], "https");
  assertEquals(body.get("grant_type"), "authorization_code");
  assertEquals(body.get("code"), "code-1");
  assertEquals(body.get("code_verifier"), "verifier-1");
  assertEquals(body.get("client_secret"), CONFIG.clientSecret);
  assertEquals(body.get("redirect_uri"), CONFIG.redirectUri);
});

test("[oidc] a failed code exchange raises", async () => {
  const fakeFetch = (() =>
    Promise.resolve(new Response("nope", { status: 400 }))) as unknown as typeof fetch;
  let message = "";
  try {
    await exchangeCode(CONFIG, "code", "verifier", fakeFetch);
  } catch (err) {
    message = (err as Error).message;
  }
  assertEquals(message, "token endpoint answered 400");
});

test("[oidc] published keys are cached and refreshed after expiry", async () => {
  let clock = 0;
  let fetches = 0;
  const fakeFetch = ((url: string) => {
    fetches += 1;
    assertEquals(url, "http://idp:9000/sso/application/o/veta/jwks/");
    return Promise.resolve(Response.json({ keys: [SIGNER.jwk] }));
  }) as unknown as typeof fetch;
  const getKeys = createJwksClient(CONFIG, fakeFetch, () => clock);
  assertEquals((await getKeys()).length, 1);
  await getKeys();
  assertEquals(fetches, 1);
  clock = 300_001;
  await getKeys();
  assertEquals(fetches, 2);
});

test("[oidc] an unusable key set raises", async () => {
  const empty = createJwksClient(CONFIG, (() =>
    Promise.resolve(Response.json({ keys: [] }))) as unknown as typeof fetch);
  const down = createJwksClient(CONFIG, (() =>
    Promise.resolve(new Response("", { status: 503 }))) as unknown as typeof fetch);
  const messages = await Promise.all(
    [empty, down].map((getKeys) =>
      getKeys().then(
        () => "",
        (err: Error) => err.message
      )
    )
  );
  assertEquals(messages, [
    "jwks endpoint returned no usable signing key",
    "jwks endpoint answered 503",
  ]);
});

test("[oidc] pending authorisations are single use, expire and are bounded", () => {
  const store = createPendingStore(1_000, 2);
  assertEquals(store.add("a", { nonce: "n", codeVerifier: "v" }, 0), true);
  assertEquals(store.take("a", 10)?.nonce, "n");
  assertEquals(store.take("a", 10), null);
  store.add("b", { nonce: "n", codeVerifier: "v" }, 0);
  assertEquals(store.take("b", 1_001), null);
  store.add("c", { nonce: "n", codeVerifier: "v" }, 0);
  store.add("d", { nonce: "n", codeVerifier: "v" }, 0);
  assertEquals(store.add("e", { nonce: "n", codeVerifier: "v" }, 500), false);
  assertEquals(store.add("f", { nonce: "n", codeVerifier: "v" }, 2_000), true);
  assertEquals(store.size(), 1);
});
