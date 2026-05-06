import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { getCookieToken } from "@veta/auth";
import { logger, registerLogSink } from "@veta/logger";
import { createConsumer, createProducer } from "@veta/messaging";
import { serveDir } from "jsr:@std/http@1.0.25/file-server";
import {
  handleHealth,
  handleSystemStatus,
  makeMarketSimWsProxy,
} from "./system-status.ts";
import { proxyGet, proxyPost, proxyPut } from "./proxy.ts";
import {
  type AuthenticatedUser,
  type GatewayContext,
  isResponse,
  type UserLimits,
} from "./context.ts";
import { handleAdminRoute } from "./routes/admin.ts";
import { handleAlertsRoute } from "./routes/alerts.ts";
import { handleAnalyticsRoute } from "./routes/analytics.ts";
import { handleLogsRoute, recordLogLine } from "./routes/logs.ts";
import { handleScenariosRoute } from "./routes/scenarios.ts";
import { handleProxiedRoutes } from "./routes/proxied.ts";
import { handleWebSocketRoute } from "./routes/websocket.ts";
import { broadcastAll, broadcastToRoles, broadcastToUser } from "./connections.ts";
import { makeValidateToken } from "./auth.ts";

const PORT = Number(Deno.env.get("GATEWAY_PORT")) || 5_011;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const STARTED_AT = Date.now();

registerLogSink((level, msg, raw) => {
  recordLogLine({ service: "gateway", level, message: msg }, raw);
});

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
const KAFKA_RELAY_URL = `http://${Deno.env.get("KAFKA_RELAY_HOST") ?? "localhost"}:${Deno.env.get("KAFKA_RELAY_PORT") ?? "5007"}`;
const FIX_ARCHIVE_URL = `http://${Deno.env.get("FIX_ARCHIVE_HOST") ?? "localhost"}:${Deno.env.get("FIX_ARCHIVE_PORT") ?? "5012"}`;
const ICEBERG_ALGO_URL = `http://${Deno.env.get("ICEBERG_ALGO_HOST") ?? "localhost"}:${Deno.env.get("ICEBERG_ALGO_PORT") ?? "5021"}`;
const SNIPER_ALGO_URL = `http://${Deno.env.get("SNIPER_ALGO_HOST") ?? "localhost"}:${Deno.env.get("SNIPER_ALGO_PORT") ?? "5022"}`;
const ARRIVAL_PRICE_ALGO_URL = `http://${Deno.env.get("ARRIVAL_PRICE_ALGO_HOST") ?? "localhost"}:${Deno.env.get("ARRIVAL_PRICE_ALGO_PORT") ?? "5023"}`;
const MOMENTUM_ALGO_URL = `http://${Deno.env.get("MOMENTUM_ALGO_HOST") ?? "localhost"}:${Deno.env.get("MOMENTUM_ALGO_PORT") ?? "5025"}`;
const IS_ALGO_URL = `http://${Deno.env.get("IS_ALGO_HOST") ?? "localhost"}:${Deno.env.get("IS_ALGO_PORT") ?? "5026"}`;
const DARK_POOL_URL = `http://${Deno.env.get("DARK_POOL_HOST") ?? "localhost"}:${Deno.env.get("DARK_POOL_PORT") ?? "5027"}`;
const CCP_SERVICE_URL = `http://${Deno.env.get("CCP_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("CCP_SERVICE_PORT") ?? "5028"}`;
const RFQ_SERVICE_URL = `http://${Deno.env.get("RFQ_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("RFQ_SERVICE_PORT") ?? "5029"}`;
const PRODUCT_SERVICE_URL = `http://${Deno.env.get("PRODUCT_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("PRODUCT_SERVICE_PORT") ?? "5030"}`;
const NEWS_AGGREGATOR_URL = `http://${Deno.env.get("NEWS_AGGREGATOR_HOST") ?? "localhost"}:${Deno.env.get("NEWS_AGGREGATOR_PORT") ?? "5013"}`;
const FIX_GATEWAY_URL = `http://${Deno.env.get("FIX_GATEWAY_HOST") ?? "localhost"}:${Deno.env.get("FIX_GATEWAY_PORT") ?? "9881"}`;
const REPLAY_URL = `http://${Deno.env.get("REPLAY_HOST") ?? "localhost"}:${Deno.env.get("REPLAY_PORT") ?? "5031"}`;
const RISK_ENGINE_URL = `http://${Deno.env.get("RISK_ENGINE_HOST") ?? "localhost"}:${Deno.env.get("RISK_ENGINE_PORT") ?? "5032"}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};


const validateToken = makeValidateToken(USER_SERVICE_URL);

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


const producer = await createProducer("gateway");

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
  // WS fallback so market ticks flow even when Kafka is unavailable.
  let lastKafkaTick = 0;
  createConsumer("gateway-market", ["market.ticks"]).then((c) => {
    c.onMessage((_topic, value) => {
      lastKafkaTick = Date.now();
      broadcastAll({ event: "marketUpdate", data: value });
    });
  });
  // WS fallback: relay market-sim ticks directly when Kafka hasn't delivered recently
  const MARKET_SIM_WS = `ws://${Deno.env.get("MARKET_SIM_HOST") ?? "localhost"}:${Deno.env.get("MARKET_SIM_PORT") ?? "5000"}`;
  const connectWsFallback = () => {
    const ws = new WebSocket(MARKET_SIM_WS);
    ws.onmessage = (ev) => {
      if (Date.now() - lastKafkaTick < 3_000) return; // Kafka flowing — skip
      try {
        const msg = JSON.parse(ev.data as string) as { event?: string; data?: unknown };
        if (msg.event === "marketData" || msg.event === "marketUpdate") {
          broadcastAll({ event: "marketUpdate", data: msg.data });
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => { setTimeout(connectWsFallback, 5_000); };
    ws.onerror = () => ws.close();
  };
  connectWsFallback();

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

  createConsumer("gateway-rfq", ["rfq.quote.update", "rfq.executed", "rfq.sellside.update"]).then((c) => {
    c.onMessage((topic, value) => {
      const v = value as { userId?: string };
      if (v.userId) {
        broadcastToUser(v.userId, { event: "rfqUpdate", topic, data: value });
      }
      // Sell-side RFQ updates: broadcast to both client and sales user
      const sv = value as { clientUserId?: string; salesUserId?: string };
      if (sv.clientUserId) broadcastToUser(sv.clientUserId, { event: "rfqSellSideUpdate", data: value });
      if (sv.salesUserId) broadcastToUser(sv.salesUserId, { event: "rfqSellSideUpdate", data: value });
    });
  }).catch(() => {});

  createConsumer("gateway-dark", ["dark.execution"]).then((c) => {
    c.onMessage((_topic, value) => {
      const v = value as { buyUserId?: string; sellUserId?: string };
      if (v.buyUserId) broadcastToUser(v.buyUserId, { event: "orderEvent", topic: "dark.execution", data: value });
      if (v.sellUserId && v.sellUserId !== v.buyUserId) {
        broadcastToUser(v.sellUserId, { event: "orderEvent", topic: "dark.execution", data: value });
      }
    });
  }).catch(() => {});

  createConsumer("gateway-risk-breaker", ["risk.breaker"]).then((c) => {
    c.onMessage((_topic, value) => {
      broadcastAll({ event: "riskBreaker", data: value });
    });
  }).catch(() => {});

  createConsumer("gateway-ccp", [
    "ccp.novation", "ccp.margin", "ccp.settlement.queued", "ccp.settlement.complete",
  ]).then((c) => {
    c.onMessage((topic, value) => {
      const v = value as { userId?: string };
      if (v.userId) {
        broadcastToUser(v.userId, { event: "ccpEvent", topic, data: value });
      } else {
        broadcastToRoles(["compliance", "admin"], { event: "ccpEvent", topic, data: value });
      }
    });
  }).catch(() => {});
}

await startConsumers();


// Fires 29 concurrent fetches — do it on a background interval, not per-request.
const HEALTH_REFRESH_MS = 5_000;

type ServiceHealth = {
  marketSim: boolean; ems: boolean; oms: boolean; journal: boolean; userService: boolean;
  fixArchive: boolean; fixGateway: boolean; observability: boolean;
  limitAlgo: boolean; twapAlgo: boolean; povAlgo: boolean; vwapAlgo: boolean;
  icebergAlgo: boolean; sniperAlgo: boolean; arrivalPriceAlgo: boolean; momentumAlgo: boolean; isAlgo: boolean;
  darkPool: boolean; ccpService: boolean; rfqService: boolean; productService: boolean;
  analytics: boolean; marketData: boolean; featureEngine: boolean; signalEngine: boolean;
  recommendationEngine: boolean; scenarioEngine: boolean; newsAggregator: boolean; llmAdvisory: boolean;
  replay: boolean;
  riskEngine: boolean;
  bus: boolean;
};

let upgradeInProgress = Deno.env.get("UPGRADE_IN_PROGRESS") === "true";
let upgradeMessage: string | null = Deno.env.get("UPGRADE_MESSAGE") ?? null;

let cachedHealth: ServiceHealth | null = null;

interface DataDepthSummary {
  totalSymbols: number;
  avgDays: number;
  minDays: number;
  queriedAt: number;
}

let cachedDataDepth: DataDepthSummary | null = null;

async function refreshDataDepth(): Promise<void> {
  try {
    const res = await fetch(`${JOURNAL_URL}/data-depth`, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const data = await res.json();
      cachedDataDepth = { totalSymbols: data.totalSymbols, avgDays: data.avgDays, minDays: data.minDays, queriedAt: data.queriedAt };
    }
  } catch { /* non-critical */ }
}

async function refreshHealth(): Promise<void> {
  const chk = (url: string) =>
    fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000) }).then((r) => r.ok).catch(() => false);
  const [
    marketSim, ems, oms, journal, userService, fixArchive, fixGateway, observability,
    limitAlgo, twapAlgo, povAlgo, vwapAlgo, icebergAlgo, sniperAlgo, arrivalPriceAlgo, momentumAlgo, isAlgo,
    darkPool, ccpService, rfqService, productService,
    analytics, marketData, featureEngine, signalEngine, recommendationEngine, scenarioEngine, newsAggregator, llmAdvisory,
    replay,
    riskEngine,
    bus,
  ] = await Promise.all([
    chk(MARKET_SIM_URL), chk(EMS_URL), chk(OMS_URL), chk(JOURNAL_URL), chk(USER_SERVICE_URL),
    chk(FIX_ARCHIVE_URL), chk(FIX_GATEWAY_URL), chk(KAFKA_RELAY_URL),
    chk(LIMIT_ALGO_URL), chk(TWAP_ALGO_URL), chk(POV_ALGO_URL), chk(VWAP_ALGO_URL),
    chk(ICEBERG_ALGO_URL), chk(SNIPER_ALGO_URL), chk(ARRIVAL_PRICE_ALGO_URL), chk(MOMENTUM_ALGO_URL), chk(IS_ALGO_URL),
    chk(DARK_POOL_URL), chk(CCP_SERVICE_URL), chk(RFQ_SERVICE_URL), chk(PRODUCT_SERVICE_URL),
    chk(ANALYTICS_URL), chk(MARKET_DATA_URL), chk(FEATURE_ENGINE_URL), chk(SIGNAL_ENGINE_URL),
    chk(RECOMMENDATION_ENGINE_URL), chk(SCENARIO_ENGINE_URL), chk(NEWS_AGGREGATOR_URL), chk(LLM_ADVISORY_URL),
    chk(REPLAY_URL),
    chk(RISK_ENGINE_URL),
    chk(KAFKA_RELAY_URL),
  ]);
  cachedHealth = {
    marketSim, ems, oms, journal, userService, fixArchive, fixGateway, observability,
    limitAlgo, twapAlgo, povAlgo, vwapAlgo, icebergAlgo, sniperAlgo, arrivalPriceAlgo, momentumAlgo, isAlgo,
    darkPool, ccpService, rfqService, productService,
    analytics, marketData, featureEngine, signalEngine, recommendationEngine, scenarioEngine, newsAggregator, llmAdvisory,
    replay,
    riskEngine,
    bus,
  };
}

refreshHealth();
refreshDataDepth();
setInterval(refreshHealth, HEALTH_REFRESH_MS);
setInterval(refreshDataDepth, 30_000);

const gatewayContext: GatewayContext = {
  requireAuth,
  producer,
  publishAccessEvent,
  urls: {
    marketSim: MARKET_SIM_URL,
    journal: JOURNAL_URL,
    userService: USER_SERVICE_URL,
    analytics: ANALYTICS_URL,
    marketData: MARKET_DATA_URL,
    llmAdvisory: LLM_ADVISORY_URL,
    newsAggregator: NEWS_AGGREGATOR_URL,
    rfqService: RFQ_SERVICE_URL,
    ccpService: CCP_SERVICE_URL,
    darkPool: DARK_POOL_URL,
    productService: PRODUCT_SERVICE_URL,
    recommendationEngine: RECOMMENDATION_ENGINE_URL,
    scenarioEngine: SCENARIO_ENGINE_URL,
    signalEngine: SIGNAL_ENGINE_URL,
    featureEngine: FEATURE_ENGINE_URL,
    fixArchive: FIX_ARCHIVE_URL,
    fixGateway: FIX_GATEWAY_URL,
    kafkaRelay: KAFKA_RELAY_URL,
    emsUrl: EMS_URL,
    omsUrl: OMS_URL,
    riskEngine: RISK_ENGINE_URL,
    replay: REPLAY_URL,
  },
};

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path === "/health" && req.method === "GET") {
    return handleHealth(VERSION);
  }

  if (path === "/ready" && req.method === "GET") {
    const h = cachedHealth;
    if (!h) {
      return new Response(JSON.stringify({ ready: false, startedAt: STARTED_AT }), {
        status: 503,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    const ready = h.marketSim && h.ems && h.oms && h.journal && h.userService;
    return new Response(
      JSON.stringify({
        ready,
        startedAt: STARTED_AT,
        producerReady: producer.isReady(),
        services: {
          marketSim: h.marketSim, ems: h.ems, oms: h.oms, journal: h.journal,
          userService: h.userService, bus: h.bus, fixArchive: h.fixArchive,
          fixGateway: h.fixGateway, observability: h.observability,
          limitAlgo: h.limitAlgo, twapAlgo: h.twapAlgo, povAlgo: h.povAlgo,
          vwapAlgo: h.vwapAlgo, icebergAlgo: h.icebergAlgo, sniperAlgo: h.sniperAlgo,
          arrivalPriceAlgo: h.arrivalPriceAlgo, momentumAlgo: h.momentumAlgo, isAlgo: h.isAlgo,
          darkPool: h.darkPool, ccpService: h.ccpService, rfqService: h.rfqService, productService: h.productService,
          analytics: h.analytics, marketData: h.marketData, featureEngine: h.featureEngine,
          signalEngine: h.signalEngine, recommendationEngine: h.recommendationEngine,
          scenarioEngine: h.scenarioEngine, newsAggregator: h.newsAggregator, llmAdvisory: h.llmAdvisory,
        },
        dataDepth: cachedDataDepth,
        upgradeInProgress,
        upgradeMessage,
      }),
      {
        status: ready ? 200 : 503,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }

  if (path === "/system" && req.method === "GET") {
    return handleSystemStatus();
  }

  if (path === "/upgrade-status" && req.method === "PUT") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    if (auth.user.role !== "admin") {
      return new Response(JSON.stringify({ error: "admin role required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    const body = await req.json() as { inProgress: boolean; message?: string };
    upgradeInProgress = body.inProgress;
    upgradeMessage = body.message ?? null;
    broadcastAll({ event: "upgradeStatus", data: { inProgress: upgradeInProgress, message: upgradeMessage } });
    return new Response(JSON.stringify({ inProgress: upgradeInProgress, message: upgradeMessage }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (path === "/ws/market-sim") {
    return makeMarketSimWsProxy(
      req,
      Number(Deno.env.get("MARKET_SIM_PORT") ?? "5000"),
    );
  }

  const wsResponse = handleWebSocketRoute(req, path, gatewayContext, { validateToken });
  if (wsResponse) return wsResponse;

  const proxiedResponse = await handleProxiedRoutes(req, path, gatewayContext);
  if (proxiedResponse) return proxiedResponse;

  const alertsResponse = await handleAlertsRoute(req, path, gatewayContext);
  if (alertsResponse) return alertsResponse;

  const analyticsResponse = await handleAnalyticsRoute(req, path, gatewayContext);
  if (analyticsResponse) return analyticsResponse;

  const adminResponse = await handleAdminRoute(req, path, gatewayContext);
  if (adminResponse) return adminResponse;

  const logsResponse = await handleLogsRoute(req, path, gatewayContext);
  if (logsResponse) return logsResponse;

  const scenariosResponse = await handleScenariosRoute(req, path, gatewayContext);
  if (scenariosResponse) return scenariosResponse;

  // Self-alias: /api/gateway/* → strip prefix and re-issue to gateway's own routes.
  // Must forward Cookie so auth-protected routes work correctly.
  if (path.startsWith("/api/gateway/")) {
    const stripped = path.slice("/api/gateway".length);
    const targetUrl = `http://localhost:${PORT}${stripped}${url.search}`;
    try {
      const fwdHeaders: Record<string, string> = {};
      const cookie = req.headers.get("cookie");
      if (cookie) fwdHeaders["cookie"] = cookie;
      const ct = req.headers.get("content-type");
      if (ct) fwdHeaders["content-type"] = ct;
      const fetchInit: RequestInit = { method: req.method, headers: fwdHeaders, signal: AbortSignal.timeout(15_000) };
      if (req.method !== "GET" && req.method !== "HEAD") fetchInit.body = await req.text();
      const res = await fetch(targetUrl, fetchInit);
      const resBody = await res.arrayBuffer();
      const resHeaders: Record<string, string> = {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      };
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) resHeaders["Set-Cookie"] = setCookie;
      return new Response(resBody, { status: res.status, headers: resHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  // Generic service proxy — /api/<service>/* → localhost:<port>/*
  // Used by the Fly.io monolith where all services run on localhost but only port 5011 is publicly accessible.
  const SVC_PROXY: Record<string, string> = {
    "market-sim":           `http://localhost:${Deno.env.get("MARKET_SIM_PORT") ?? "5000"}`,
    "ems":                  `http://localhost:${Deno.env.get("EMS_PORT") ?? "5001"}`,
    "oms":                  `http://localhost:${Deno.env.get("OMS_PORT") ?? "5002"}`,
    "limit-algo":           `http://localhost:${Deno.env.get("ALGO_TRADER_PORT") ?? "5003"}`,
    "twap-algo":            `http://localhost:${Deno.env.get("TWAP_ALGO_PORT") ?? "5004"}`,
    "pov-algo":             `http://localhost:${Deno.env.get("POV_ALGO_PORT") ?? "5005"}`,
    "vwap-algo":            `http://localhost:${Deno.env.get("VWAP_ALGO_PORT") ?? "5006"}`,
    "observability":        `http://localhost:${Deno.env.get("KAFKA_RELAY_PORT") ?? "5007"}`,
    "journal":              JOURNAL_URL,
    "fix-archive":          `http://localhost:${Deno.env.get("FIX_ARCHIVE_PORT") ?? "5012"}`,
    "fix-gateway":          `http://localhost:${Deno.env.get("FIX_GATEWAY_PORT") ?? "9881"}`,
    "kafka-relay":          `http://localhost:${Deno.env.get("KAFKA_RELAY_PORT") ?? "5007"}`,
    "user-service":         USER_SERVICE_URL,
    "news-aggregator":      `http://localhost:${Deno.env.get("NEWS_AGGREGATOR_PORT") ?? "5013"}`,
    "analytics":            ANALYTICS_URL,
    "market-data":          MARKET_DATA_URL,
    "market-data-adapters": `http://localhost:${Deno.env.get("MARKET_DATA_ADAPTERS_PORT") ?? "5016"}`,
    "feature-engine":       FEATURE_ENGINE_URL,
    "signal-engine":        SIGNAL_ENGINE_URL,
    "recommendation-engine": RECOMMENDATION_ENGINE_URL,
    "scenario-engine":      SCENARIO_ENGINE_URL,
    "iceberg-algo":         `http://localhost:${Deno.env.get("ICEBERG_ALGO_PORT") ?? "5021"}`,
    "sniper-algo":          `http://localhost:${Deno.env.get("SNIPER_ALGO_PORT") ?? "5022"}`,
    "arrival-price-algo":   `http://localhost:${Deno.env.get("ARRIVAL_PRICE_ALGO_PORT") ?? "5023"}`,
    "llm-advisory":         LLM_ADVISORY_URL,
    "momentum-algo":        `http://localhost:${Deno.env.get("MOMENTUM_ALGO_PORT") ?? "5025"}`,
    "is-algo":              `http://localhost:${Deno.env.get("IS_ALGO_PORT") ?? "5026"}`,
    "dark-pool":            DARK_POOL_URL,
    "ccp-service":          CCP_SERVICE_URL,
    "rfq-service":          RFQ_SERVICE_URL,
    "replay":               REPLAY_URL,
    "risk-engine":          RISK_ENGINE_URL,
  };

  const svcMatch = path.match(/^\/api\/([^/]+)(\/.*)?$/);
  if (svcMatch) {
    const svcName = svcMatch[1];
    const svcPath = svcMatch[2] ?? "/";
    const target = SVC_PROXY[svcName];
    if (target) {
      const targetUrl = `${target}${svcPath}${url.search}`;
      if (req.method === "GET" || req.method === "DELETE") return proxyGet(targetUrl, req);
      if (req.method === "POST") return proxyPost(targetUrl, req);
      if (req.method === "PUT") return proxyPut(targetUrl, req);
    }
  }

  const frontendDist = Deno.env.get("FRONTEND_DIST");
  if (frontendDist && req.method === "GET") {
    const res = await serveDir(req, { fsRoot: frontendDist, quiet: true });
    if (res.status !== 404) return res;
    if (!path.startsWith("/assets/")) {
      return serveDir(new Request(new URL("/index.html", req.url)), { fsRoot: frontendDist, quiet: true });
    }
    return res;
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

logger.info(`API Gateway running on port ${PORT}`);
