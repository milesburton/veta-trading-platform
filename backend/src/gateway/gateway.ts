import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("GATEWAY_PORT")) || 5_011;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const MARKET_SIM_URL = `http://${Deno.env.get("MARKET_SIM_HOST") ?? "localhost"}:${Deno.env.get("MARKET_SIM_PORT") ?? "5000"}`;
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${Deno.env.get("JOURNAL_PORT") ?? "5009"}`;
const USER_SERVICE_URL = `http://${Deno.env.get("USER_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("USER_SERVICE_PORT") ?? "5008"}`;
const ANALYTICS_URL = `http://${Deno.env.get("ANALYTICS_HOST") ?? "localhost"}:${Deno.env.get("ANALYTICS_PORT") ?? "5014"}`;
const MARKET_DATA_URL = `http://${Deno.env.get("MARKET_DATA_HOST") ?? "localhost"}:${Deno.env.get("MARKET_DATA_PORT") ?? "5015"}`;
const FEATURE_ENGINE_URL = `http://${Deno.env.get("FEATURE_ENGINE_HOST") ?? "localhost"}:${Deno.env.get("FEATURE_ENGINE_PORT") ?? "5017"}`;
const SIGNAL_ENGINE_URL = `http://${Deno.env.get("SIGNAL_ENGINE_HOST") ?? "localhost"}:${Deno.env.get("SIGNAL_ENGINE_PORT") ?? "5018"}`;
const RECOMMENDATION_ENGINE_URL = `http://${Deno.env.get("RECOMMENDATION_ENGINE_HOST") ?? "localhost"}:${Deno.env.get("RECOMMENDATION_ENGINE_PORT") ?? "5019"}`;
const SCENARIO_ENGINE_URL = `http://${Deno.env.get("SCENARIO_ENGINE_HOST") ?? "localhost"}:${Deno.env.get("SCENARIO_ENGINE_PORT") ?? "5020"}`;
const LLM_ADVISORY_URL = `http://${Deno.env.get("LLM_ADVISORY_HOST") ?? "localhost"}:${Deno.env.get("LLM_ADVISORY_PORT") ?? "5024"}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
}

interface UserLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  return match ? match[1] : null;
}

const authCache = new Map<string, { result: { user: AuthenticatedUser; limits: UserLimits }; expiresAt: number }>();

async function validateToken(token: string): Promise<{ user: AuthenticatedUser; limits: UserLimits } | null> {
  const now = Date.now();
  const cached = authCache.get(token);
  if (cached) {
    if (cached.expiresAt > now) return cached.result;
    authCache.delete(token);
  }

  try {
    const res = await fetch(`${USER_SERVICE_URL}/sessions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const result = await res.json() as { user: AuthenticatedUser; limits: UserLimits };
    authCache.set(token, { result, expiresAt: now + 10_000 });
    return result;
  } catch {
    return null;
  }
}

async function requireAuth(req: Request): Promise<{ user: AuthenticatedUser; limits: UserLimits } | Response> {
  const url = new URL(req.url);
  const token = getCookieToken(req);
  if (!token) {
    publishAccessEvent({ action: "auth_failure", path: url.pathname, reason: "no session cookie" });
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const auth = await validateToken(token);
  if (!auth) {
    publishAccessEvent({ action: "auth_failure", path: url.pathname, reason: "invalid or expired token" });
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  publishAccessEvent({ action: "http_request", userId: auth.user.id, userRole: auth.user.role, path: url.pathname });
  return auth;
}

function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}

/** Publish a user.access event to the bus (best-effort, never throws). */
function publishAccessEvent(event: {
  action: string;
  userId?: string;
  userRole?: string;
  path?: string;
  reason?: string;
  orderId?: string;
  scope?: string;
  scopeValue?: string;
}) {
  producer?.send("user.access", { ...event, ts: Date.now() }).catch(() => {});
}

const clients = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const frame = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    } catch {
      clients.delete(ws);
    }
  }
}

const producer = await createProducer("gateway").catch((err) => {
  console.warn("[gateway] Redpanda unavailable for publishing:", err.message);
  return null;
});

const ORDER_TOPICS = [
  "orders.new",
  "orders.submitted",
  "orders.routed",
  "orders.child",
  "orders.filled",
  "orders.expired",
  "orders.rejected",
  "orders.cancelled",
  "orders.resumed",
];

function startConsumers(): void {
  createConsumer("gateway-market", ["market.ticks"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcast({ event: "marketUpdate", data: value });
    });
  });

  createConsumer("gateway-orders", ORDER_TOPICS).then((c) => {
    c.onMessage((topic, value) => {
      broadcast({ event: "orderEvent", topic, data: value });
    });
  });

  createConsumer("gateway-algo", ["algo.heartbeat"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcast({ event: "algoHeartbeat", data: value });
    });
  });

  createConsumer("gateway-news", ["news.feed"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcast({ event: "newsUpdate", data: value });
    });
  });

  const pendingSignals = new Map<string, unknown>();
  let signalFlushTimer: number | null = null;
  createConsumer("gateway-signals", ["market.signals"]).then((c) => {
    c.onMessage((_topic, value) => {
      const sig = value as { symbol: string };
      pendingSignals.set(sig.symbol, value);
      if (!signalFlushTimer) {
        signalFlushTimer = setTimeout(() => {
          for (const [, data] of pendingSignals) {
            broadcast({ event: "signalUpdate", data });
          }
          pendingSignals.clear();
          signalFlushTimer = null;
        }, 500) as unknown as number;
      }
    });
  }).catch(() => {});

  const pendingFeatures = new Map<string, unknown>();
  let featureFlushTimer: number | null = null;
  createConsumer("gateway-features", ["market.features"]).then((c) => {
    c.onMessage((_topic, value) => {
      const fv = value as { symbol: string };
      pendingFeatures.set(fv.symbol, value);
      if (!featureFlushTimer) {
        featureFlushTimer = setTimeout(() => {
          for (const [, data] of pendingFeatures) {
            broadcast({ event: "featureUpdate", data });
          }
          pendingFeatures.clear();
          featureFlushTimer = null;
        }, 500) as unknown as number;
      }
    });
  }).catch(() => {});

  createConsumer("gateway-recommendations", ["market.recommendations"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcast({ event: "recommendationUpdate", data: value });
    });
  }).catch(() => {});

  createConsumer("gateway-advisory", ["llm.advisory.ready"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcast({ event: "advisoryUpdate", data: value });
    });
  }).catch(() => {});
}

await startConsumers();

async function proxyPost(internalUrl: string, req: Request): Promise<Response> {
  try {
    const body = await req.text();
    const res = await fetch(internalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const resBody = await res.arrayBuffer();
    return new Response(resBody, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function proxyPut(internalUrl: string, req: Request): Promise<Response> {
  try {
    const body = await req.text();
    const res = await fetch(internalUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const resBody = await res.arrayBuffer();
    return new Response(resBody, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function proxyGet(internalUrl: string, req: Request): Promise<Response> {
  const src = new URL(req.url);
  const target = new URL(internalUrl);
  target.search = src.search;
  try {
    const res = await fetch(target.toString(), {
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "gateway", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (path === "/ws" || path === "/ws/gateway") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Authenticate before upgrading — WebSocket clients can't receive HTTP 401 after upgrade
    const token = getCookieToken(req);
    let auth = token ? await validateToken(token) : null;
    // We allow unauthenticated WS connections for market data (read-only push).
    // Order submission will be rejected per-message if auth is missing.

    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      clients.add(socket);
      console.log(`[gateway] Client connected user=${auth?.user.id ?? "anonymous"} (total=${clients.size})`);
      if (auth) {
        socket.send(JSON.stringify({ event: "authIdentity", data: { user: auth.user, limits: auth.limits } }));
        publishAccessEvent({ action: "ws_connect", userId: auth.user.id, userRole: auth.user.role });
      } else {
        publishAccessEvent({ action: "ws_connect", reason: "anonymous — no valid session" });
      }
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; payload: Record<string, unknown> };

        // Post-connection auth: used by non-browser clients (e.g. Deno test runner)
        // that cannot set Cookie headers on WebSocket upgrade requests.
        if (msg.type === "authenticate") {
          const tok = msg.payload.token as string | undefined;
          const result = tok ? await validateToken(tok) : null;
          if (result) {
            auth = result;
            socket.send(JSON.stringify({ event: "authIdentity", data: { user: result.user, limits: result.limits } }));
            publishAccessEvent({ action: "ws_connect", userId: result.user.id, userRole: result.user.role });
          } else {
            socket.send(JSON.stringify({ event: "authError", data: { reason: "Invalid or expired token" } }));
          }
          return;
        }

        if (msg.type === "submitOrder") {
          const currentAuth = auth ?? (token ? await validateToken(token) : null);
          if (!currentAuth) {
            publishAccessEvent({ action: "order_rejected", reason: "unauthenticated — session expired" });
            socket.send(JSON.stringify({
              event: "orderRejected",
              data: {
                reason: "Unauthenticated — please log in again",
                clientOrderId: msg.payload.clientOrderId ?? null,
              },
            }));
            return;
          }
          if (!producer) {
            socket.send(JSON.stringify({ event: "error", message: "Bus unavailable — order not submitted" }));
            return;
          }
          const orderWithUser = {
            ...msg.payload,
            userId: currentAuth.user.id,
            userRole: currentAuth.user.role,
          };
          await producer.send("orders.new", orderWithUser);
          publishAccessEvent({
            action: "order_submitted",
            userId: currentAuth.user.id,
            userRole: currentAuth.user.role,
            orderId: (msg.payload.clientOrderId ?? msg.payload.orderId) as string | undefined,
          });
          socket.send(JSON.stringify({ event: "orderAck", data: orderWithUser }));
        }

        if (msg.type === "killOrders") {
          const currentAuth = auth ?? (token ? await validateToken(token) : null);
          if (!currentAuth) {
            publishAccessEvent({ action: "auth_failure", reason: "killOrders — unauthenticated" });
            socket.send(JSON.stringify({ event: "error", data: { message: "Unauthenticated — please log in again" } }));
            return;
          }
          if (!producer) {
            socket.send(JSON.stringify({ event: "error", data: { message: "Bus unavailable" } }));
            return;
          }
          const killCommand = {
            ...msg.payload,
            issuedBy: currentAuth.user.id,
            issuedByRole: currentAuth.user.role,
            ts: Date.now(),
          };
          await producer.send("orders.kill", killCommand);
          publishAccessEvent({
            action: "orders_kill",
            userId: currentAuth.user.id,
            userRole: currentAuth.user.role,
            scope: msg.payload.scope as string | undefined,
            scopeValue: msg.payload.scopeValue as string | undefined,
          });
          socket.send(JSON.stringify({ event: "killAck", data: killCommand }));
        }

        if (msg.type === "resumeOrders") {
          const currentAuth = auth ?? (token ? await validateToken(token) : null);
          if (!currentAuth) {
            publishAccessEvent({ action: "auth_failure", reason: "resumeOrders — unauthenticated" });
            socket.send(JSON.stringify({ event: "error", data: { message: "Unauthenticated — please log in again" } }));
            return;
          }
          if (!producer) {
            socket.send(JSON.stringify({ event: "error", data: { message: "Bus unavailable" } }));
            return;
          }
          const resumeCommand = {
            ...msg.payload,
            issuedBy: currentAuth.user.id,
            issuedByRole: currentAuth.user.role,
            ts: Date.now(),
          };
          await producer.send("orders.resume", resumeCommand);
          publishAccessEvent({
            action: "orders_resume",
            userId: currentAuth.user.id,
            userRole: currentAuth.user.role,
            scope: msg.payload.scope as string | undefined,
            scopeValue: msg.payload.scopeValue as string | undefined,
          });
          socket.send(JSON.stringify({ event: "resumeAck", data: resumeCommand }));
        }
      } catch (err) {
        socket.send(JSON.stringify({ event: "error", message: (err as Error).message }));
      }
    };

    socket.onclose = () => {
      clients.delete(socket);
      console.log(`[gateway] Client disconnected (total=${clients.size})`);
    };

    socket.onerror = () => socket.close();

    return response;
  }

  if (path === "/assets" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${MARKET_SIM_URL}/assets`, req);
  }

  if (path === "/candles" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${JOURNAL_URL}/candles`, req);
  }

  if (path === "/orders" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${JOURNAL_URL}/orders`, req);
  }

  if (path === "/grid/query" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const body = await req.text();
      const res = await fetch(`${JOURNAL_URL}/grid/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Inject userId so journal can tag observability events
          "x-user-id": auth.user.id,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  if (path === "/preferences" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/users/${auth.user.id}/preferences`, {
        signal: AbortSignal.timeout(5_000),
      });
      const body = await res.arrayBuffer();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  if (path === "/preferences" && req.method === "PUT") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const body = await req.text();
      const res = await fetch(`${USER_SERVICE_URL}/users/${auth.user.id}/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  if (path === "/shared-workspaces" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/shared-workspaces`, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(5_000),
      });
      const body = await res.arrayBuffer();
      return new Response(body, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  if (path === "/shared-workspaces" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const body = await req.text();
      const res = await fetch(`${USER_SERVICE_URL}/shared-workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  const sharedWsDeleteMatch = path.match(/^\/shared-workspaces\/([^/]+)$/);
  if (sharedWsDeleteMatch && req.method === "DELETE") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/shared-workspaces/${sharedWsDeleteMatch[1]}`, {
        method: "DELETE",
        headers: { cookie: req.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  const sharedWsGetMatch = path.match(/^\/shared-workspaces\/([^/]+)$/);
  if (sharedWsGetMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/shared-workspaces/${sharedWsGetMatch[1]}`, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  if (path === "/alerts" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/users/${auth.user.id}/alerts`, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  if (path === "/alerts" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const body = await req.arrayBuffer();
      const res = await fetch(`${USER_SERVICE_URL}/users/${auth.user.id}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  if (path === "/alerts/dismiss-all" && req.method === "PUT") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/users/${auth.user.id}/alerts/dismiss-all`, {
        method: "PUT",
        headers: { cookie: req.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  const alertDismissMatch = path.match(/^\/alerts\/([^/]+)\/dismiss$/);
  if (req.method === "PUT" && alertDismissMatch) {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    try {
      const res = await fetch(`${USER_SERVICE_URL}/users/${auth.user.id}/alerts/${alertDismissMatch[1]}/dismiss`, {
        method: "PUT",
        headers: { cookie: req.headers.get("cookie") ?? "" },
        signal: AbortSignal.timeout(5_000),
      });
      const resBody = await res.arrayBuffer();
      return new Response(resBody, { status: res.status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
    }
  }

  if (path === "/market-data/sources" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${MARKET_DATA_URL}/sources`, req);
  }

  if (path === "/market-data/overrides" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${MARKET_DATA_URL}/overrides`, req);
  }

  if (path === "/market-data/overrides" && req.method === "PUT") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPut(`${MARKET_DATA_URL}/overrides`, req);
  }

  const mdsToggleMatch = path.match(/^\/market-data\/sources\/([^/]+)\/toggle$/);
  if (mdsToggleMatch && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${MARKET_DATA_URL}/sources/${mdsToggleMatch[1]}/toggle`, req);
  }

  if (path === "/analytics/quote" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/quote`, req);
  }

  if (path === "/analytics/scenario" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/scenario`, req);
  }

  if (path === "/analytics/recommend" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/recommend`, req);
  }

  const featureMatch = path.match(/^\/intelligence\/features(\/.*)?$/);
  if (featureMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const suffix = featureMatch[1] ?? "";
    return proxyGet(`${FEATURE_ENGINE_URL}/features${suffix}`, req);
  }

  const signalMatch = path.match(/^\/intelligence\/signals(\/.*)?$/);
  if (signalMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const suffix = signalMatch[1] ?? "";
    return proxyGet(`${SIGNAL_ENGINE_URL}/signals${suffix}`, req);
  }

  if (path === "/intelligence/weights" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${SIGNAL_ENGINE_URL}/weights`, req);
  }

  if (path === "/intelligence/weights" && req.method === "PUT") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (auth.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    return proxyPut(`${SIGNAL_ENGINE_URL}/weights`, req);
  }

  if (path === "/intelligence/recommendations" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${RECOMMENDATION_ENGINE_URL}/recommendations`, req);
  }

  if (path === "/intelligence/scenario" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${SCENARIO_ENGINE_URL}/scenario`, req);
  }

  if (path === "/intelligence/replay" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${SIGNAL_ENGINE_URL}/replay`, req);
  }

  const advisoryNoteMatch = path.match(/^\/advisory\/([^/]+)$/);
  if (advisoryNoteMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${LLM_ADVISORY_URL}/advisory/${advisoryNoteMatch[1]}`, req);
  }

  if (path === "/advisory/request" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.text();
    const parsed = JSON.parse(body) as { symbol?: string };
    return proxyPost(`${LLM_ADVISORY_URL}/advisory/request`, new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, requestedBy: auth.user.id }),
    }));
  }

  if (path === "/advisory/jobs" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${LLM_ADVISORY_URL}/jobs`, req);
  }

  if (path === "/load-test" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (auth.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    if (!producer) {
      return new Response(JSON.stringify({ error: "Bus unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    let body: { symbols?: string[]; orderCount?: number; strategy?: string };
    try {
      body = await req.json() as typeof body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const symbols = body.symbols ?? ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"];
    const orderCount = Math.min(body.orderCount ?? 100, 500);
    const strategy = body.strategy ?? "LIMIT";
    const jobId = `load-${Date.now()}`;

    await Promise.all(
      Array.from({ length: orderCount }, (_, i) => {
        const symbol = symbols[i % symbols.length];
        const side = i % 2 === 0 ? "BUY" : "SELL";
        return producer!.send("orders.new", {
          clientOrderId: `${jobId}-${i}`,
          asset: symbol,
          side,
          quantity: 10 + (i % 90),
          limitPrice: side === "BUY" ? 99_999 : 1,
          expiresAt: 300,
          strategy,
          algoParams: { strategy },
          userId: auth.user.id,
          userRole: auth.user.role,
          _loadTestJobId: jobId,
        });
      }),
    );

    publishAccessEvent({
      action: "http_request",
      userId: auth.user.id,
      userRole: auth.user.role,
      path: "/load-test",
    });

    return new Response(
      JSON.stringify({ jobId, submitted: orderCount, symbols, strategy }),
      { status: 202, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}, { port: PORT });

console.log(`[gateway] API Gateway running on port ${PORT}`);
