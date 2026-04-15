import {
  assert,
  assertEquals,
} from "jsr:@std/assert@0.217";

const BASE = Deno.env.get("VETA_BASE_URL") ?? "http://localhost";

function svcUrl(localPort: number, prodPath: string): string {
  if (BASE === "http://localhost") return `${BASE}:${localPort}`;
  return `${BASE}${prodPath}`;
}

export const GATEWAY_URL    = svcUrl(5011, "/api/gateway");
export const JOURNAL_URL    = svcUrl(5009, "/api/journal");
export const OBS_URL        = svcUrl(5007, "/api/observability");
export const USER_SVC_URL   = svcUrl(5008, "/api/user-service");
export const ARCHIVE_URL    = svcUrl(5012, "/api/fix-archive");
const OAUTH_CLIENT_ID       = "veta-automation";
const OAUTH_REDIRECT_URI    = "postmessage";
const OAUTH_PASSWORD        = Deno.env.get("OAUTH2_SHARED_SECRET") ?? "veta-dev-passcode";

export const GATEWAY_WS_URL = BASE === "http://localhost"
  ? "ws://localhost:5011/ws"
  : BASE.replace(/^http/, "ws") + "/ws/gateway";

export function timeout(ms = 10_000) { return AbortSignal.timeout(ms); }

async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = `veta-test-${crypto.randomUUID()}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return { verifier, challenge };
}

/** Complete the OAuth2 authorization-code exchange and return the raw veta_user token value. */
export async function loginAs(userId: string): Promise<string> {
  const pkce = await createPkcePair();
  const authorizeRes = await fetch(`${USER_SVC_URL}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      username: userId,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: "code",
      scope: "openid profile",
      password: OAUTH_PASSWORD,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    }),
    signal: timeout(),
  });
  assertEquals(authorizeRes.status, 200, `OAuth authorize as ${userId} failed`);
  const { code } = await authorizeRes.json() as { code: string };

  const tokenRes = await fetch(`${USER_SVC_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: OAUTH_CLIENT_ID,
      code,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
      code_verifier: pkce.verifier,
    }),
    signal: timeout(),
  });
  await tokenRes.body?.cancel();
  assertEquals(tokenRes.status, 200, `OAuth token exchange as ${userId} failed`);
  const cookie = tokenRes.headers.get("set-cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  assert(match, `No veta_user cookie for ${userId}`);
  return match[1];
}

/**
 * Login and verify the token is accepted by the gateway HTTP layer before
 * returning. Retries up to maxAttempts times (with short delays) to handle
 * transient gateway→user-service latency spikes on shared VMs.
 * A successful HTTP probe also warms the gateway's authCache (60s TTL),
 * ensuring subsequent WS authenticate messages get a fast cache hit.
 */
export async function loginAsVerified(userId: string, maxAttempts = 3): Promise<string> {
  let lastToken = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    let token: string;
    try {
      token = await loginAs(userId);
    } catch { continue; /* transient network error — retry */ }
    lastToken = token;
    // Quick probe: can gateway validate this token via HTTP?
    // Uses /me (no downstream proxy) to warm the authCache reliably.
    try {
      const res = await fetch(`${GATEWAY_URL}/me`, {
        headers: { Cookie: `veta_user=${token}` },
        signal: timeout(8_000),
      });
      await res.body?.cancel();
      if (res.ok) return token;
    } catch { /* retry */ }
  }
  return lastToken; // best effort after all attempts
}

export interface WsOrderResponse {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Submit an order via gateway WebSocket (post-connection auth).
 * Returns the full gateway response (orderAck or orderRejected).
 * The clientOrderId used is embedded in the returned data.
 */
export async function submitOrderViaWs(
  token: string,
  order: {
    asset: string;
    side: "BUY" | "SELL";
    quantity: number;
    limitPrice: number;
    strategy?: string;
    instrumentType?: string;
    algoParams?: Record<string, unknown>;
    expiresAt?: number;
  },
  timeoutMs = 20_000,
): Promise<WsOrderResponse & { clientOrderId: string }> {
  const clientOrderId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const ws = new WebSocket(GATEWAY_WS_URL);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  let response: WsOrderResponse | null = null;
  try {
    response = await new Promise<WsOrderResponse>((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error("WS timeout")); }, timeoutMs);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as WsOrderResponse;
        if (msg.event === "authIdentity") {
          ws.send(JSON.stringify({
            type: "submitOrder",
            payload: {
              clientOrderId,
              asset: order.asset,
              side: order.side,
              quantity: order.quantity,
              limitPrice: order.limitPrice,
              expiresAt: order.expiresAt ?? 60,
              strategy: order.strategy ?? "LIMIT",
              instrumentType: order.instrumentType,
              algoParams: order.algoParams ?? { strategy: order.strategy ?? "LIMIT" },
            },
          }));
        }
        if (msg.event === "orderAck" || msg.event === "orderRejected" || msg.event === "error") {
          clearTimeout(timer);
          ws.close();
          resolve(msg);
        }
        if (msg.event === "authError") {
          clearTimeout(timer);
          ws.close();
          reject(new Error(`authError:${JSON.stringify((msg as unknown as Record<string, unknown>).data ?? msg)}`));
        }
      };
      ws.onerror = () => { clearTimeout(timer); ws.close(); reject(new Error("WS error")); };
    });
  } finally {
    await closed;
  }
  return { ...response!, clientOrderId };
}

/**
 * Submit an order with automatic retry on transient auth failures.
 * Re-creates the session token and retries up to maxRetries times.
 */
export async function submitOrderWithRetry(
  userId: string,
  order: {
    asset: string;
    side: "BUY" | "SELL";
    quantity: number;
    limitPrice: number;
    strategy?: string;
    instrumentType?: string;
    algoParams?: Record<string, unknown>;
    expiresAt?: number;
  },
  maxRetries = 5,
): Promise<WsOrderResponse & { clientOrderId: string }> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1_000 + attempt * 500));
    const token = await loginAsVerified(userId);
    try {
      return await submitOrderViaWs(token, order);
    } catch (err) {
      lastErr = err as Error;
      const msg = (err as Error).message;
      // Only retry on auth failure or WS timeout — not on WS error (connection refused)
      if (!msg.startsWith("authError:") && msg !== "WS timeout") throw err;
    }
  }
  throw lastErr ?? new Error("submitOrderWithRetry: exhausted retries");
}
