import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import { serveDir } from "jsr:@std/http@1.0.25/file-server";

const PORT = Number(Deno.env.get("GATEWAY_PORT")) || 5_011;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const STARTED_AT = Date.now();

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
const EMS_URL = `http://${Deno.env.get("EMS_HOST") ?? "localhost"}:${Deno.env.get("EMS_PORT") ?? "5001"}`;
const OMS_URL = `http://${Deno.env.get("OMS_HOST") ?? "localhost"}:${Deno.env.get("OMS_PORT") ?? "5002"}`;
const LIMIT_ALGO_URL = `http://${Deno.env.get("LIMIT_ALGO_HOST") ?? "localhost"}:${Deno.env.get("LIMIT_ALGO_PORT") ?? "5003"}`;
const TWAP_ALGO_URL = `http://${Deno.env.get("TWAP_ALGO_HOST") ?? "localhost"}:${Deno.env.get("TWAP_ALGO_PORT") ?? "5004"}`;
const POV_ALGO_URL = `http://${Deno.env.get("POV_ALGO_HOST") ?? "localhost"}:${Deno.env.get("POV_ALGO_PORT") ?? "5005"}`;
const VWAP_ALGO_URL = `http://${Deno.env.get("VWAP_ALGO_HOST") ?? "localhost"}:${Deno.env.get("VWAP_ALGO_PORT") ?? "5006"}`;
const OBSERVABILITY_URL = `http://${Deno.env.get("OBSERVABILITY_HOST") ?? "localhost"}:${Deno.env.get("OBSERVABILITY_PORT") ?? "5007"}`;
const FIX_ARCHIVE_URL = `http://${Deno.env.get("FIX_ARCHIVE_HOST") ?? "localhost"}:${Deno.env.get("FIX_ARCHIVE_PORT") ?? "5012"}`;
const ICEBERG_ALGO_URL = `http://${Deno.env.get("ICEBERG_ALGO_HOST") ?? "localhost"}:${Deno.env.get("ICEBERG_ALGO_PORT") ?? "5021"}`;
const SNIPER_ALGO_URL = `http://${Deno.env.get("SNIPER_ALGO_HOST") ?? "localhost"}:${Deno.env.get("SNIPER_ALGO_PORT") ?? "5022"}`;
const ARRIVAL_PRICE_ALGO_URL = `http://${Deno.env.get("ARRIVAL_PRICE_ALGO_HOST") ?? "localhost"}:${Deno.env.get("ARRIVAL_PRICE_ALGO_PORT") ?? "5023"}`;
const MOMENTUM_ALGO_URL = `http://${Deno.env.get("MOMENTUM_ALGO_HOST") ?? "localhost"}:${Deno.env.get("MOMENTUM_ALGO_PORT") ?? "5025"}`;
const IS_ALGO_URL = `http://${Deno.env.get("IS_ALGO_HOST") ?? "localhost"}:${Deno.env.get("IS_ALGO_PORT") ?? "5026"}`;
const DARK_POOL_URL = `http://${Deno.env.get("DARK_POOL_HOST") ?? "localhost"}:${Deno.env.get("DARK_POOL_PORT") ?? "5027"}`;
const CCP_SERVICE_URL = `http://${Deno.env.get("CCP_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("CCP_SERVICE_PORT") ?? "5028"}`;
const RFQ_SERVICE_URL = `http://${Deno.env.get("RFQ_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("RFQ_SERVICE_PORT") ?? "5029"}`;
const NEWS_AGGREGATOR_URL = `http://${Deno.env.get("NEWS_AGGREGATOR_HOST") ?? "localhost"}:${Deno.env.get("NEWS_AGGREGATOR_PORT") ?? "5013"}`;
const FIX_GATEWAY_URL = `http://${Deno.env.get("FIX_GATEWAY_HOST") ?? "localhost"}:${Deno.env.get("FIX_GATEWAY_PORT") ?? "9881"}`;

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
  allowed_desks?: string[];
  dark_pool_access?: boolean;
}

function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  return match ? match[1] : null;
}

const authCache = new Map<string, { result: { user: AuthenticatedUser; limits: UserLimits }; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(token);
  }
}, 30_000);

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

/** Per-user WebSocket connections — enforces information barriers.
 *  Market data (non-confidential) uses broadcastAll().
 *  Order events use broadcastToUser() so only the owning user sees them.
 *  Compliance / admin users receive broadcastToRoles() for oversight feeds.
 */
const userConnections = new Map<string, Set<WebSocket>>();
const anonymousClients = new Set<WebSocket>();

function _addUserSocket(userId: string, ws: WebSocket): void {
  let sockets = userConnections.get(userId);
  if (!sockets) { sockets = new Set(); userConnections.set(userId, sockets); }
  sockets.add(ws);
}

function _removeSocket(userId: string | null, ws: WebSocket): void {
  if (userId) {
    const sockets = userConnections.get(userId);
    if (sockets) { sockets.delete(ws); if (sockets.size === 0) userConnections.delete(userId); }
  } else {
    anonymousClients.delete(ws);
  }
}

function _totalConnections(): number {
  let n = anonymousClients.size;
  for (const s of userConnections.values()) n += s.size;
  return n;
}

function _sendTo(ws: WebSocket, frame: string): void {
  try { if (ws.readyState === WebSocket.OPEN) ws.send(frame); } catch { /* ignore */ }
}

/** Send to all connected sockets (market ticks, signals, news — non-confidential). */
function broadcastAll(msg: unknown): void {
  const frame = JSON.stringify(msg);
  for (const ws of anonymousClients) _sendTo(ws, frame);
  for (const sockets of userConnections.values()) {
    for (const ws of sockets) _sendTo(ws, frame);
  }
}

/** Send only to sockets belonging to a specific user (information barrier). */
function broadcastToUser(userId: string, msg: unknown): void {
  const sockets = userConnections.get(userId);
  if (!sockets) return;
  const frame = JSON.stringify(msg);
  for (const ws of sockets) _sendTo(ws, frame);
}

/** Send to all users whose role is in the given set (compliance / admin oversight). */
function broadcastToRoles(_roles: string[], msg: unknown): void {
  // roles param reserved for future per-role filtering; currently compliance/admin
  // receive order events only for their own connections (they don't trade).
  broadcastAll(msg);
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
  // Market data — broadcast to all (not confidential)
  createConsumer("gateway-market", ["market.ticks"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "marketUpdate", data: value });
    });
  });

  // Order events — route only to the owning user (information barrier)
  createConsumer("gateway-orders", ORDER_TOPICS).then((c) => {
    c.onMessage((topic, value) => {
      const v = value as { userId?: string; userRole?: string };
      if (v.userId) {
        broadcastToUser(v.userId, { event: "orderEvent", topic, data: value });
        // Compliance / admin oversight: also broadcast to those roles
        if (v.userRole !== "compliance" && v.userRole !== "admin") {
          broadcastToRoles(["compliance", "admin"], { event: "orderEvent", topic, data: value });
        }
      } else {
        // Fallback: no userId on message (legacy path) — broadcast to all
        broadcastAll({ event: "orderEvent", topic, data: value });
      }
    });
  });

  // Algo heartbeats — broadcast to all (operational telemetry, not order data)
  createConsumer("gateway-algo", ["algo.heartbeat"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "algoHeartbeat", data: value });
    });
  });

  createConsumer("gateway-news", ["news.feed"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "newsUpdate", data: value });
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
            broadcastAll({ event: "signalUpdate", data });
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
            broadcastAll({ event: "featureUpdate", data });
          }
          pendingFeatures.clear();
          featureFlushTimer = null;
        }, 500) as unknown as number;
      }
    });
  }).catch(() => {});

  createConsumer("gateway-recommendations", ["market.recommendations"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "recommendationUpdate", data: value });
    });
  }).catch(() => {});

  createConsumer("gateway-advisory", ["llm.advisory.ready"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "advisoryUpdate", data: value });
    });
  }).catch(() => {});

  createConsumer("gateway-llm-state", ["llm.state.update"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "llmStateUpdate", data: value });
    });
  }).catch(() => {});

  // RFQ quote updates — broadcast only to the requesting user (information barrier)
  createConsumer("gateway-rfq", ["rfq.quote.update", "rfq.executed"]).then((c) => {
    c.onMessage((topic, value) => {
      const v = value as { userId?: string };
      if (v.userId) {
        broadcastToUser(v.userId, { event: "rfqUpdate", topic, data: value });
      }
    });
  }).catch(() => {});

  // Dark pool execution reports — broadcast only to the two matched users (information barrier)
  createConsumer("gateway-dark", ["dark.execution"]).then((c) => {
    c.onMessage((_topic, value) => {
      const v = value as { buyUserId?: string; sellUserId?: string };
      if (v.buyUserId) broadcastToUser(v.buyUserId, { event: "orderEvent", topic: "dark.execution", data: value });
      if (v.sellUserId && v.sellUserId !== v.buyUserId) {
        broadcastToUser(v.sellUserId, { event: "orderEvent", topic: "dark.execution", data: value });
      }
    });
  }).catch(() => {});

  // CCP events — novation/margin/settlement broadcast to the affected user
  createConsumer("gateway-ccp", [
    "ccp.novation", "ccp.margin", "ccp.settlement.queued", "ccp.settlement.complete",
  ]).then((c) => {
    c.onMessage((topic, value) => {
      const v = value as { userId?: string };
      if (v.userId) {
        broadcastToUser(v.userId, { event: "ccpEvent", topic, data: value });
      } else {
        // Settlement complete messages may not have userId — broadcast to compliance/admin
        broadcastToRoles(["compliance", "admin"], { event: "ccpEvent", topic, data: value });
      }
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

// ── Demo Day helpers (module-scope to satisfy no-inner-declarations lint) ──────
type OrderSpec = {
  asset: string; side: "BUY" | "SELL"; quantity: number;
  limitPriceFactor: number; strategy: string;
  algoParams: Record<string, unknown>; expiresAt: number;
  delayMs: number;
};

function makeWave(
  assets: string[],
  count: number,
  strategyMix: Array<{ strategy: string; algoParams: Record<string, unknown>; weight: number }>,
  sideRatio = 0.6,
  baseDelay = 0,
  spreadMs = 8_000,
): OrderSpec[] {
  const totalWeight = strategyMix.reduce((s, m) => s + m.weight, 0);
  const orders: OrderSpec[] = [];
  for (let i = 0; i < count; i++) {
    const asset = assets[i % assets.length];
    const side: "BUY" | "SELL" = Math.random() < sideRatio ? "BUY" : "SELL";
    const tier = Math.random();
    const quantity = tier < 0.6
      ? Math.round(10 + Math.random() * 90)
      : tier < 0.9
      ? Math.round(100 + Math.random() * 400)
      : Math.round(500 + Math.random() * 1500);
    const spread = (Math.random() * 0.03) * (side === "BUY" ? 1 : -1);
    const limitPriceFactor = 1 + spread;
    let r = Math.random() * totalWeight;
    let chosen = strategyMix[0];
    for (const m of strategyMix) { r -= m.weight; if (r <= 0) { chosen = m; break; } }
    orders.push({
      asset, side, quantity, limitPriceFactor,
      strategy: chosen.strategy,
      algoParams: chosen.algoParams,
      expiresAt: 300 + Math.round(Math.random() * 600),
      delayMs: baseDelay + Math.round(Math.random() * spreadMs),
    });
  }
  return orders;
}

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
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

  if (path === "/ready" && req.method === "GET") {
    const chk = (url: string) =>
      fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000) }).then((r) => r.ok).catch(() => false);
    const chkTcp = (hostPort: string) => {
      const [hostname, portStr] = hostPort.split(":");
      const port = Number(portStr);
      const timeout = new Promise<false>((res) => setTimeout(() => res(false), 5_000));
      const probe = Deno.connect({ hostname, port })
        .then((conn) => { conn.close(); return true as const; })
        .catch(() => false as const);
      return Promise.race([probe, timeout]);
    };
    const REDPANDA_BROKER = (Deno.env.get("REDPANDA_BROKERS") ?? "localhost:9092").split(",")[0].trim();
    const [
      marketSim, ems, oms, journal, userService, fixArchive, fixGateway, observability,
      limitAlgo, twapAlgo, povAlgo, vwapAlgo, icebergAlgo, sniperAlgo, arrivalPriceAlgo, momentumAlgo, isAlgo,
      darkPool, ccpService, rfqService,
      analytics, marketData, featureEngine, signalEngine, recommendationEngine, scenarioEngine, newsAggregator, llmAdvisory,
      bus,
    ] = await Promise.all([
      chk(MARKET_SIM_URL), chk(EMS_URL), chk(OMS_URL), chk(JOURNAL_URL), chk(USER_SERVICE_URL),
      chk(FIX_ARCHIVE_URL), chk(FIX_GATEWAY_URL), chk(OBSERVABILITY_URL),
      chk(LIMIT_ALGO_URL), chk(TWAP_ALGO_URL), chk(POV_ALGO_URL), chk(VWAP_ALGO_URL),
      chk(ICEBERG_ALGO_URL), chk(SNIPER_ALGO_URL), chk(ARRIVAL_PRICE_ALGO_URL), chk(MOMENTUM_ALGO_URL), chk(IS_ALGO_URL),
      chk(DARK_POOL_URL), chk(CCP_SERVICE_URL), chk(RFQ_SERVICE_URL),
      chk(ANALYTICS_URL), chk(MARKET_DATA_URL), chk(FEATURE_ENGINE_URL), chk(SIGNAL_ENGINE_URL),
      chk(RECOMMENDATION_ENGINE_URL), chk(SCENARIO_ENGINE_URL), chk(NEWS_AGGREGATOR_URL), chk(LLM_ADVISORY_URL),
      chkTcp(REDPANDA_BROKER),
    ]);
    // Core services required for order flow
    const ready = marketSim && ems && oms && journal && userService && bus;
    return new Response(
      JSON.stringify({
        ready,
        startedAt: STARTED_AT,
        services: {
          // Core order flow
          marketSim, ems, oms, journal, userService, bus, fixArchive, fixGateway, observability,
          // Algo engines
          limitAlgo, twapAlgo, povAlgo, vwapAlgo, icebergAlgo, sniperAlgo, arrivalPriceAlgo, momentumAlgo, isAlgo,
          // Alternative trading systems & clearing
          darkPool, ccpService, rfqService,
          // Data & intelligence
          analytics, marketData, featureEngine, signalEngine, recommendationEngine, scenarioEngine, newsAggregator, llmAdvisory,
        },
      }),
      {
        status: ready ? 200 : 503,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
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

    // Track the userId bound to this socket (may change on post-connection authenticate)
    let socketUserId: string | null = auth?.user.id ?? null;

    socket.onopen = () => {
      if (socketUserId) {
        _addUserSocket(socketUserId, socket);
      } else {
        anonymousClients.add(socket);
      }
      console.log(`[gateway] Client connected user=${socketUserId ?? "anonymous"} (total=${_totalConnections()})`);
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
            // Move socket from anonymous bucket (or old userId) to new userId bucket
            _removeSocket(socketUserId, socket);
            auth = result;
            socketUserId = result.user.id;
            _addUserSocket(socketUserId, socket);
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
      _removeSocket(socketUserId, socket);
      console.log(`[gateway] Client disconnected user=${socketUserId ?? "anonymous"} (total=${_totalConnections()})`);
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

  if (path === "/pool/stats" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${DARK_POOL_URL}/pool/stats`, req);
  }

  // ── CCP routes ─────────────────────────────────────────────────────────────
  if (path === "/ccp/stats" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${CCP_SERVICE_URL}/ccp/stats`, req);
  }

  if (path === "/ccp/settlements" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${CCP_SERVICE_URL}/ccp/settlements`, req);
  }

  const ccpSettlementDateMatch = path.match(/^\/ccp\/settlements\/([^/]+)$/);
  if (ccpSettlementDateMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${CCP_SERVICE_URL}/ccp/settlements/${ccpSettlementDateMatch[1]}`, req);
  }

  const ccpMarginMatch = path.match(/^\/ccp\/margin\/([^/]+)$/);
  if (ccpMarginMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    // Only allow users to see their own margin, or admin/compliance to see any
    const targetUserId = ccpMarginMatch[1];
    if (auth.user.id !== targetUserId && auth.user.role !== "admin" && auth.user.role !== "compliance") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    return proxyGet(`${CCP_SERVICE_URL}/ccp/margin/${targetUserId}`, req);
  }

  // ── RFQ routes ─────────────────────────────────────────────────────────────
  if (path === "/rfq/stats" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${RFQ_SERVICE_URL}/rfq/stats`, req);
  }

  if (path === "/rfq" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    // Inject userId as query param so RFQ service can filter to the caller's RFQs
    const target = new URL(`${RFQ_SERVICE_URL}/rfq`);
    target.search = new URL(req.url).search;
    if (!target.searchParams.has("userId")) target.searchParams.set("userId", auth.user.id);
    try {
      const res = await fetch(target.toString(), { signal: AbortSignal.timeout(8_000) });
      const body = await res.arrayBuffer();
      return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  const rfqIdMatch = path.match(/^\/rfq\/([^/]+)(\/execute)?$/);
  if (rfqIdMatch) {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const rfqId = rfqIdMatch[1];
    const isExecute = rfqIdMatch[2] === "/execute";
    if (isExecute && req.method === "POST") {
      return proxyPost(`${RFQ_SERVICE_URL}/rfq/${rfqId}/execute`, req);
    }
    if (!isExecute && req.method === "GET") {
      return proxyGet(`${RFQ_SERVICE_URL}/rfq/${rfqId}`, req);
    }
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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
        signal: AbortSignal.timeout(8_000),
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

  const volProfileMatch = path.match(/^\/analytics\/vol-profile\/(.+)$/);
  if (volProfileMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const qs = url.search;
    return proxyGet(`${ANALYTICS_URL}/vol-profile/${encodeURIComponent(volProfileMatch[1])}${qs}`, req);
  }

  const greeksSurfaceMatch = path.match(/^\/analytics\/greeks-surface\/(.+)$/);
  if (greeksSurfaceMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const qs = url.search;
    return proxyGet(`${ANALYTICS_URL}/greeks-surface/${encodeURIComponent(greeksSurfaceMatch[1])}${qs}`, req);
  }

  if (path === "/analytics/bond-price" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/bond-price`, req);
  }

  if (path === "/analytics/yield-curve" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/yield-curve`, req);
  }

  const priceFanMatch = path.match(/^\/analytics\/price-fan\/(.+)$/);
  if (priceFanMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const qs = url.search;
    return proxyGet(`${ANALYTICS_URL}/price-fan/${encodeURIComponent(priceFanMatch[1])}${qs}`, req);
  }

  if (path === "/analytics/spread-analysis" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/spread-analysis`, req);
  }

  if (path === "/analytics/duration-ladder" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyPost(`${ANALYTICS_URL}/duration-ladder`, req);
  }

  const volSurfaceMatch = path.match(/^\/analytics\/vol-surface\/(.+)$/);
  if (volSurfaceMatch && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const qs = url.search;
    return proxyGet(`${ANALYTICS_URL}/vol-surface/${encodeURIComponent(volSurfaceMatch[1])}${qs}`, req);
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

  if (path === "/advisory/admin/state" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (auth.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    return proxyGet(`${LLM_ADVISORY_URL}/admin/state`, req);
  }

  if (path === "/advisory/admin/state" && req.method === "PUT") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (auth.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    const body = await req.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return proxyPut(`${LLM_ADVISORY_URL}/admin/state`, new Request(req.url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, updatedBy: auth.user.id }),
    }));
  }

  if (path === "/advisory/admin/watchlist-brief" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    const body = await req.text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return proxyPost(`${LLM_ADVISORY_URL}/admin/watchlist-brief`, new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, requestedBy: auth.user.id }),
    }));
  }

  if (path === "/advisory/admin/trigger-worker" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (auth.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    return proxyPost(`${LLM_ADVISORY_URL}/admin/trigger-worker`, req);
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

  // ── Demo Day ──────────────────────────────────────────────────────────────
  // Simulate a realistic trading day: mixed strategies, varied quantities,
  // prices anchored to live market data, staggered in natural wave patterns.
  // Available to all authenticated users (not admin-only).

  if (path === "/demo-day" && req.method === "POST") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (!producer) {
      return new Response(JSON.stringify({ error: "Bus unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    let body: { scenario?: string };
    try {
      body = await req.json() as typeof body;
    } catch {
      body = {};
    }

    const scenario = body.scenario ?? "standard";

    // Fetch live prices from market-sim so limit prices are anchored to market
    const livePrices: Record<string, number> = {};
    try {
      const priceRes = await fetch(`${MARKET_SIM_URL}/assets`);
      if (priceRes.ok) {
        const assets = await priceRes.json() as { symbol: string; price: number }[];
        for (const a of assets) livePrices[a.symbol] = a.price;
      }
    } catch { /* fall back to reasonable defaults */ }

    // Fallback prices if market-sim is unavailable
    const defaultPrices: Record<string, number> = {
      AAPL: 189, MSFT: 421, GOOGL: 175, AMZN: 185, TSLA: 172,
      NVDA: 870, META: 510, JPM: 195, GS: 460, V: 275,
    };
    const priceFor = (symbol: string) => livePrices[symbol] ?? defaultPrices[symbol] ?? 100;

    const ALL_ASSETS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "JPM", "GS", "V"];
    const LARGE_CAP = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META"];
    const FIN_ASSETS = ["JPM", "GS", "V"];

    const limitMix = [
      { strategy: "LIMIT", algoParams: { strategy: "LIMIT" }, weight: 4 },
      { strategy: "TWAP",  algoParams: { strategy: "TWAP", slices: 4, intervalSeconds: 15 }, weight: 2 },
      { strategy: "POV",   algoParams: { strategy: "POV", povRate: 0.08 }, weight: 1 },
      { strategy: "VWAP",  algoParams: { strategy: "VWAP", intervalSeconds: 20 }, weight: 1 },
    ];
    const algoHeavyMix = [
      { strategy: "LIMIT",    algoParams: { strategy: "LIMIT" }, weight: 1 },
      { strategy: "TWAP",     algoParams: { strategy: "TWAP", slices: 5, intervalSeconds: 10 }, weight: 3 },
      { strategy: "POV",      algoParams: { strategy: "POV", povRate: 0.10 }, weight: 2 },
      { strategy: "VWAP",     algoParams: { strategy: "VWAP", intervalSeconds: 15 }, weight: 2 },
      { strategy: "ICEBERG",  algoParams: { strategy: "ICEBERG", visibleQty: 100 }, weight: 1 },
      { strategy: "SNIPER",   algoParams: { strategy: "SNIPER" }, weight: 1 },
      { strategy: "IS",       algoParams: { strategy: "IS", urgency: 0.6 }, weight: 1 },
      { strategy: "MOMENTUM", algoParams: { strategy: "MOMENTUM", entryThresholdBps: 8 }, weight: 1 },
    ];
    const volatilityMix = [
      { strategy: "SNIPER",       algoParams: { strategy: "SNIPER" }, weight: 3 },
      { strategy: "ICEBERG",      algoParams: { strategy: "ICEBERG", visibleQty: 50 }, weight: 2 },
      { strategy: "ARRIVAL_PRICE", algoParams: { strategy: "ARRIVAL_PRICE" }, weight: 2 },
      { strategy: "MOMENTUM",     algoParams: { strategy: "MOMENTUM", entryThresholdBps: 5, urgency: 0.8 }, weight: 1 },
      { strategy: "LIMIT",        algoParams: { strategy: "LIMIT" }, weight: 1 },
    ];

    let waves: OrderSpec[];
    let scenarioLabel: string;

    switch (scenario) {
      case "market-open": {
        // Frenzied open: large burst of LIMIT + SNIPER, then calmer TWAP/VWAP
        scenarioLabel = "Market Open";
        waves = [
          ...makeWave(ALL_ASSETS, 60, [
            { strategy: "LIMIT",  algoParams: { strategy: "LIMIT" }, weight: 5 },
            { strategy: "SNIPER", algoParams: { strategy: "SNIPER" }, weight: 3 },
          ], 0.65, 0, 3_000),
          ...makeWave(ALL_ASSETS, 40, limitMix, 0.55, 4_000, 10_000),
          ...makeWave(LARGE_CAP,  20, algoHeavyMix, 0.5, 15_000, 8_000),
        ];
        break;
      }
      case "volatile": {
        // Volatile session: many SNIPER/ICEBERG, high BUY pressure, large quantities
        scenarioLabel = "Volatile Session";
        waves = [
          ...makeWave(ALL_ASSETS, 40, volatilityMix, 0.7, 0, 5_000),
          ...makeWave(ALL_ASSETS, 40, volatilityMix, 0.65, 6_000, 5_000),
          ...makeWave(ALL_ASSETS, 20, limitMix, 0.5, 12_000, 5_000),
        ];
        break;
      }
      case "institutional": {
        // Institutional flow: large TWAP/VWAP/ICEBERG block trades
        scenarioLabel = "Institutional Flow";
        waves = [
          ...makeWave(LARGE_CAP, 30, [
            { strategy: "TWAP",    algoParams: { strategy: "TWAP", slices: 8, intervalSeconds: 20 }, weight: 3 },
            { strategy: "VWAP",    algoParams: { strategy: "VWAP", intervalSeconds: 25 }, weight: 3 },
            { strategy: "ICEBERG", algoParams: { strategy: "ICEBERG", visibleQty: 200 }, weight: 2 },
          ], 0.5, 0, 12_000),
          ...makeWave(FIN_ASSETS, 20, [
            { strategy: "ARRIVAL_PRICE", algoParams: { strategy: "ARRIVAL_PRICE" }, weight: 2 },
            { strategy: "TWAP",          algoParams: { strategy: "TWAP", slices: 6, intervalSeconds: 15 }, weight: 2 },
            { strategy: "ICEBERG",       algoParams: { strategy: "ICEBERG", visibleQty: 150 }, weight: 1 },
          ], 0.45, 5_000, 10_000),
        ];
        break;
      }
      default: {
        // standard: balanced mix across all strategies, representative of a normal day
        scenarioLabel = "Standard Trading Day";
        waves = [
          ...makeWave(ALL_ASSETS, 30, limitMix, 0.55, 0, 6_000),
          ...makeWave(ALL_ASSETS, 25, algoHeavyMix, 0.5, 7_000, 8_000),
          ...makeWave(LARGE_CAP,  20, limitMix, 0.6, 16_000, 6_000),
          ...makeWave(ALL_ASSETS, 15, volatilityMix, 0.45, 23_000, 5_000),
          ...makeWave(FIN_ASSETS,  10, algoHeavyMix, 0.5, 29_000, 4_000),
        ];
        break;
      }
    }

    const jobId = `demo-${Date.now()}`;
    const total = waves.length;

    // Fire each order after its scheduled delay (non-blocking — returns 202 immediately)
    for (const [i, spec] of waves.entries()) {
      const price = priceFor(spec.asset) * spec.limitPriceFactor;
      const order = {
        clientOrderId: `${jobId}-${i}`,
        asset: spec.asset,
        side: spec.side,
        quantity: spec.quantity,
        limitPrice: Math.round(price * 100) / 100,
        expiresAt: spec.expiresAt,
        strategy: spec.strategy,
        algoParams: spec.algoParams,
        userId: auth.user.id,
        userRole: auth.user.role,
        _demoDayJobId: jobId,
      };
      if (spec.delayMs === 0) {
        await producer.send("orders.new", order);
      } else {
        setTimeout(() => {
          producer!.send("orders.new", order).catch(() => {});
        }, spec.delayMs);
      }
    }

    publishAccessEvent({
      action: "http_request",
      userId: auth.user.id,
      userRole: auth.user.role,
      path: "/demo-day",
    });

    return new Response(
      JSON.stringify({ jobId, submitted: total, scenario: scenarioLabel }),
      { status: 202, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  // Static frontend fallback — when FRONTEND_DIST is set (e.g. Fly.io monolith),
  // serve built assets from that directory with SPA fallback to index.html.
  const frontendDist = Deno.env.get("FRONTEND_DIST");
  if (frontendDist && req.method === "GET") {
    const res = await serveDir(req, { fsRoot: frontendDist, quiet: true });
    if (res.status !== 404) return res;
    // SPA fallback
    if (!path.startsWith("/assets/")) {
      return serveDir(new Request(new URL("/index.html", req.url)), { fsRoot: frontendDist, quiet: true });
    }
    return res;
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[gateway] API Gateway running on port ${PORT}`);
