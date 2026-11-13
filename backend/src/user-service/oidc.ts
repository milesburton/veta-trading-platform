import { z } from "zod";

export const OIDC_ROLE_PRECEDENCE = [
  "admin",
  "compliance",
  "risk-manager",
  "desk-head",
  "oncall",
  "trader",
  "sales",
  "viewer",
] as const;
export type OidcRole = (typeof OIDC_ROLE_PRECEDENCE)[number];

const GROUP_PREFIX = "veta-";
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_AGE_SECONDS = 600;
const BACK_CHANNEL_TIMEOUT_MS = 8_000;
const JWKS_TTL_MS = 300_000;

export interface OidcConfig {
  issuer: string;
  internalBaseUrl: string;
  applicationSlug: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  requireMfa: boolean;
}

const EnvSchema = z.object({
  OIDC_ISSUER: z.string().url(),
  OIDC_INTERNAL_BASE_URL: z.string().url(),
  OIDC_APPLICATION_SLUG: z.string().regex(/^[a-z0-9-]+$/),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(16),
  OIDC_REDIRECT_URI: z.string().url(),
});

export function readOidcConfig(env: Record<string, string | undefined>): OidcConfig | null {
  if ((env.OIDC_ENABLED ?? "false").toLowerCase() !== "true") return null;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`OIDC_ENABLED=true but the configuration is invalid: ${missing}`);
  }
  return {
    issuer: parsed.data.OIDC_ISSUER,
    internalBaseUrl: parsed.data.OIDC_INTERNAL_BASE_URL.replace(/\/+$/, ""),
    applicationSlug: parsed.data.OIDC_APPLICATION_SLUG,
    clientId: parsed.data.OIDC_CLIENT_ID,
    clientSecret: parsed.data.OIDC_CLIENT_SECRET,
    redirectUri: parsed.data.OIDC_REDIRECT_URI,
    requireMfa: (env.OIDC_REQUIRE_MFA ?? "true").toLowerCase() !== "false",
  };
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomUrlToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function publicOrigin(config: OidcConfig): URL {
  return new URL(config.issuer);
}

function providerRoot(config: OidcConfig): string {
  const suffix = `/application/o/${config.applicationSlug}/`;
  if (!config.issuer.endsWith(suffix)) {
    throw new Error(`OIDC_ISSUER must end with ${suffix}`);
  }
  return config.issuer.slice(0, -suffix.length);
}

export function buildAuthorizationUrl(
  config: OidcConfig,
  params: { state: string; nonce: string; codeChallenge: string }
): string {
  const url = new URL(`${providerRoot(config)}/application/o/authorize/`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function backChannelHeaders(config: OidcConfig): Record<string, string> {
  const origin = publicOrigin(config);
  return {
    "X-Forwarded-Host": origin.host,
    "X-Forwarded-Proto": origin.protocol.replace(":", ""),
  };
}

const TokenResponseSchema = z.object({ id_token: z.string().min(1) });

export async function exchangeCode(
  config: OidcConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });
  const res = await fetchImpl(`${config.internalBaseUrl}/application/o/token/`, {
    method: "POST",
    headers: {
      ...backChannelHeaders(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(BACK_CHANNEL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token endpoint answered ${res.status}`);
  return TokenResponseSchema.parse(await res.json()).id_token;
}

const JwkSchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().optional(),
  n: z.string().min(1),
  e: z.string().min(1),
  use: z.string().optional(),
  alg: z.string().optional(),
});
const JwksSchema = z.object({ keys: z.array(z.unknown()) });
export type Jwk = z.infer<typeof JwkSchema>;

export function parseJwks(payload: unknown): Jwk[] {
  return JwksSchema.parse(payload).keys.flatMap((key) => {
    const parsed = JwkSchema.safeParse(key);
    return parsed.success && (parsed.data.use ?? "sig") === "sig" ? [parsed.data] : [];
  });
}

export function createJwksClient(
  config: OidcConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): () => Promise<Jwk[]> {
  let cached: { keys: Jwk[]; expiresAt: number } | null = null;
  return async () => {
    if (cached && cached.expiresAt > now()) return cached.keys;
    const res = await fetchImpl(
      `${config.internalBaseUrl}/application/o/${config.applicationSlug}/jwks/`,
      {
        headers: backChannelHeaders(config),
        redirect: "error",
        signal: AbortSignal.timeout(BACK_CHANNEL_TIMEOUT_MS),
      }
    );
    if (!res.ok) throw new Error(`jwks endpoint answered ${res.status}`);
    const keys = parseJwks(await res.json());
    if (keys.length === 0) throw new Error("jwks endpoint returned no usable signing key");
    cached = { keys, expiresAt: now() + JWKS_TTL_MS };
    return keys;
  };
}

const HeaderSchema = z.object({ alg: z.literal("RS256"), kid: z.string().optional() });

const ClaimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
  amr: z.array(z.string()).optional(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  groups: z.array(z.string()).optional(),
});
export type IdTokenClaims = z.infer<typeof ClaimsSchema>;

export class IdTokenError extends Error {}

function decodeJsonSegment(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(segment)));
  } catch {
    throw new IdTokenError("malformed token segment");
  }
}

async function signatureIsValid(
  key: Jwk,
  signedPart: string,
  signature: Uint8Array<ArrayBuffer>
): Promise<boolean> {
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signature,
    new TextEncoder().encode(signedPart)
  );
}

export async function verifyIdToken(
  token: string,
  options: {
    config: OidcConfig;
    keys: readonly Jwk[];
    expectedNonce: string;
    nowSeconds: number;
  }
): Promise<IdTokenClaims> {
  const segments = token.split(".");
  if (segments.length !== 3) throw new IdTokenError("token is not a signed JWT");
  const [headerSegment, payloadSegment, signatureSegment] = segments;

  const header = HeaderSchema.safeParse(decodeJsonSegment(headerSegment));
  if (!header.success) throw new IdTokenError("unsupported signing algorithm");

  const candidates = options.keys.filter(
    (key) => header.data.kid === undefined || key.kid === undefined || key.kid === header.data.kid
  );
  const signature = fromBase64Url(signatureSegment);
  const signedPart = `${headerSegment}.${payloadSegment}`;
  const results = await Promise.all(
    candidates.map((key) => signatureIsValid(key, signedPart, signature).catch(() => false))
  );
  if (!results.includes(true)) throw new IdTokenError("signature does not verify");

  const claims = ClaimsSchema.safeParse(decodeJsonSegment(payloadSegment));
  if (!claims.success) throw new IdTokenError("required claims are missing");
  const { config, expectedNonce, nowSeconds } = options;
  const audiences = Array.isArray(claims.data.aud) ? claims.data.aud : [claims.data.aud];

  if (claims.data.iss !== config.issuer) throw new IdTokenError("issuer mismatch");
  if (!audiences.includes(config.clientId)) throw new IdTokenError("audience mismatch");
  if (claims.data.exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new IdTokenError("token expired");
  if (claims.data.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new IdTokenError("token issued in the future");
  }
  if (claims.data.iat + MAX_TOKEN_AGE_SECONDS < nowSeconds) throw new IdTokenError("token too old");
  if (claims.data.nonce !== expectedNonce) throw new IdTokenError("nonce mismatch");
  if (config.requireMfa && !(claims.data.amr ?? []).includes("mfa")) {
    throw new IdTokenError("sign-in did not use a second factor");
  }
  return claims.data;
}

export function roleFromGroups(groups: readonly string[] | undefined): OidcRole {
  const granted = new Set(
    (groups ?? [])
      .filter((group) => group.startsWith(GROUP_PREFIX))
      .map((group) => group.slice(GROUP_PREFIX.length))
  );
  return OIDC_ROLE_PRECEDENCE.find((role) => granted.has(role)) ?? "viewer";
}

export function userIdFromClaims(claims: IdTokenClaims): string | null {
  const candidate = (claims.preferred_username ?? claims.sub).trim().toLowerCase();
  return /^[a-z0-9_-]{2,64}$/.test(candidate) ? candidate : null;
}

export interface PendingAuthorization {
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
}

export function createPendingStore(ttlMs = 600_000, maxEntries = 1_000) {
  const pending = new Map<string, PendingAuthorization>();
  const prune = (now: number) => {
    for (const [state, entry] of pending) {
      if (entry.expiresAt <= now) pending.delete(state);
    }
  };
  return {
    add(state: string, entry: Omit<PendingAuthorization, "expiresAt">, now: number): boolean {
      prune(now);
      if (pending.size >= maxEntries) return false;
      pending.set(state, { ...entry, expiresAt: now + ttlMs });
      return true;
    },
    take(state: string, now: number): PendingAuthorization | null {
      const entry = pending.get(state);
      pending.delete(state);
      return entry && entry.expiresAt > now ? entry : null;
    },
    size: () => pending.size,
  };
}
