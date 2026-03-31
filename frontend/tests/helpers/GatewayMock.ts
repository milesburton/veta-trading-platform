/**
 * GatewayMock — typed WebSocket + HTTP interceptor for Playwright tests.
 *
 * Intercepts:
 *   ws://localhost:PORT/ws/gateway        → fake WebSocket server
 *   POST /api/gateway/grid/query         → server-driven grid query (returns mock order store)
 *   /api/user-service/sessions/me        → mock session response
 *   /api/**                              → stub all other GETs to null
 *
 * Usage:
 *   const gw = await GatewayMock.attach(page);
 *   await gw.sendAuthIdentity({ role: "trader" });
 *   await gw.sendMarketUpdate({ AAPL: 189.5, MSFT: 421.0 });
 *   const msg = await gw.nextOutbound("submitOrder");
 */

import type { Page, WebSocketRoute } from "@playwright/test";

// ── Protocol types (mirroring gatewayMiddleware) ──────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

export interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

export interface AssetDef {
  symbol: string;
  name: string;
  sector: string;
  exchange?: string;
  marketCapB?: number;
  beta?: number;
  dividendYield?: number;
  peRatio?: number;
  lotSize?: number;
}

// Inbound message shapes (gateway → client)
type GatewayInbound =
  | { event: "authIdentity"; data: { user: AuthUser; limits: TradingLimits } }
  | { event: "marketUpdate"; data: { prices: Record<string, number>; volumes: Record<string, number> } }
  | { event: "orderEvent"; topic: string; data: Record<string, unknown> }
  | { event: "orderRejected"; data: { clientOrderId: string; reason: string } }
  | { event: "newsUpdate"; data: Record<string, unknown> }
  | { event: "signalUpdate"; data: Record<string, unknown> }
  | { event: "featureUpdate"; data: Record<string, unknown> }
  | { event: "recommendationUpdate"; data: Record<string, unknown> }
  | { event: "advisoryUpdate"; data: Record<string, unknown> };

// Outbound message shape (client → gateway)
interface GatewayOutbound {
  type: string;
  payload: Record<string, unknown>;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

/**
 * Alice Chen — high-touch equity trader.
 * Full strategy access, lower qty/notional limits. Focuses on single-stock
 * discretionary trades with LIMIT and TWAP execution.
 */
export const DEFAULT_TRADER: AuthUser = {
  id: "trader-1",
  name: "Alice Chen",
  role: "trader",
  avatar_emoji: "AL",
};

/**
 * Bob Martinez — low-touch / algorithmic trader.
 * All algo strategies enabled (LIMIT, TWAP, POV, VWAP, ICEBERG, SNIPER,
 * ARRIVAL_PRICE). Higher qty/notional caps — routes via systematic algos.
 */
export const ALGO_TRADER: AuthUser = {
  id: "trader-2",
  name: "Bob Martinez",
  role: "trader",
  avatar_emoji: "BM",
};

/**
 * Carol Davis — fixed income trader.
 * Limited to LIMIT strategy only (bonds always execute at quoted price).
 * Accesses yield-curve, spread-analysis, duration-ladder, vol-surface panels.
 */
export const FI_TRADER: AuthUser = {
  id: "trader-3",
  name: "Carol Davis",
  role: "trader",
  avatar_emoji: "CD",
};

/**
 * David Kim — research analyst (read-only).
 * No trading permissions. Accesses intelligence, signal-explainability,
 * research-radar, and analytics panels only.
 */
export const RESEARCH_ANALYST: AuthUser = {
  id: "trader-4",
  name: "David Kim",
  role: "trader",
  avatar_emoji: "DK",
};

export const DEFAULT_ADMIN: AuthUser = {
  id: "admin-1",
  name: "Admin User",
  role: "admin",
  avatar_emoji: "AD",
};

/** Trading limits for high-touch equity trader (Alice). */
export const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity", "derivatives"],
  dark_pool_access: false,
};

/** Trading limits for low-touch algorithmic trader (Bob) — all strategies, higher caps. */
export const ALGO_TRADER_LIMITS: TradingLimits = {
  max_order_qty: 100_000,
  max_daily_notional: 50_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE"],
  allowed_desks: ["equity"],
  dark_pool_access: true,
};

/** Trading limits for FI trader (Carol) — LIMIT only, high notional for bond size. */
export const FI_TRADER_LIMITS: TradingLimits = {
  max_order_qty: 1_000,
  max_daily_notional: 100_000_000,
  allowed_strategies: ["LIMIT"],
  allowed_desks: ["fi"],
  dark_pool_access: false,
};

/** Trading limits for research analyst (David) — no trading permitted. */
export const ANALYST_LIMITS: TradingLimits = {
  max_order_qty: 0,
  max_daily_notional: 0,
  allowed_strategies: [],
  allowed_desks: [],
  dark_pool_access: false,
};

export const DEFAULT_ASSETS: AssetDef[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 3000, beta: 1.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2800, beta: 0.9 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1800, beta: 1.1 },
];

// ── FI mock responses ─────────────────────────────────────────────────────────

export const MOCK_BOND_PRICE_RESPONSE = {
  price: 987.43,
  yieldAnnual: 0.0488,
  modifiedDuration: 8.72,
  convexity: 92.4,
  dv01: 0.8618,
  cashFlows: [],
  computedAt: Date.now(),
};

export const MOCK_SPREAD_ANALYSIS_RESPONSE = {
  bondYield: 0.0488,
  tenorYears: 10,
  govSpotRate: 0.0445,
  gSpread: 43.0,
  zSpread: 44.2,
  oas: 44.2,
  computedAt: Date.now(),
};

export const MOCK_DURATION_LADDER_RESPONSE = {
  positions: [
    {
      bondIndex: 0,
      totalDv01: 0.8618,
      modifiedDuration: 8.72,
      contributions: [
        { bondIndex: 0, tenorLabel: "2y", dv01Contribution: 0.12 },
        { bondIndex: 0, tenorLabel: "5y", dv01Contribution: 0.31 },
        { bondIndex: 0, tenorLabel: "10y", dv01Contribution: 0.43 },
      ],
    },
  ],
  buckets: [
    { tenorLabel: "3m", tenorYears: 0.25, netDv01: 0 },
    { tenorLabel: "1y", tenorYears: 1, netDv01: 0 },
    { tenorLabel: "2y", tenorYears: 2, netDv01: 0.12 },
    { tenorLabel: "5y", tenorYears: 5, netDv01: 0.31 },
    { tenorLabel: "10y", tenorYears: 10, netDv01: 0.43 },
    { tenorLabel: "30y", tenorYears: 30, netDv01: 0 },
  ],
  totalPortfolioDv01: 0.8618,
  computedAt: Date.now(),
};

export const MOCK_VOL_SURFACE_RESPONSE = {
  symbol: "AAPL",
  spotPrice: 189.30,
  atTheMoneyVol: 0.25,
  expiries: [7 * 86400, 14 * 86400, 30 * 86400, 60 * 86400, 90 * 86400],
  moneynesses: [0.70, 0.80, 0.90, 0.95, 1.0, 1.05, 1.10, 1.20, 1.30],
  surface: (() => {
    const expiries = [
      { secs: 7 * 86400, label: "7d" },
      { secs: 14 * 86400, label: "14d" },
      { secs: 30 * 86400, label: "30d" },
      { secs: 60 * 86400, label: "60d" },
      { secs: 90 * 86400, label: "90d" },
    ];
    const moneynesses = [0.70, 0.80, 0.90, 0.95, 1.0, 1.05, 1.10, 1.20, 1.30];
    const spot = 189.30;
    const atm = 0.25;
    const skew = -0.10;
    const curvature = 0.05;
    return expiries.flatMap(({ secs, label }) =>
      moneynesses.map((m) => {
        const lnM = Math.log(m);
        const iv = Math.max(0.01, atm * (1 + skew * lnM + curvature * lnM * lnM));
        return {
          expirySecs: secs,
          expiryLabel: label,
          moneyness: m,
          strike: Math.round(spot * m * 100) / 100,
          impliedVol: iv,
        };
      })
    );
  })(),
  computedAt: Date.now(),
};

// ── Mock order record (matches OrderRecord shape used in blotter) ─────────────

interface MockOrder {
  id: string;
  clientOrderId: string;
  submittedAt: number;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  strategy: string;
  status: "queued" | "executing" | "filled" | "expired" | "rejected";
  filled: number;
  algoParams: Record<string, unknown>;
  children: unknown[];
}

// ── GatewayMock class ─────────────────────────────────────────────────────────

export class GatewayMock {
  private _wsRoute: WebSocketRoute | null = null;
  private _outboundQueue: GatewayOutbound[] = [];
  private _outboundResolvers: Array<{ type: string; resolve: (msg: GatewayOutbound) => void }> = [];

  /** In-memory order store — keyed by clientOrderId. Served by grid/query mock. */
  private _orders = new Map<string, MockOrder>();

  private constructor(private readonly page: Page) {}

  /**
   * Attach mock to the page. Must be called BEFORE page.goto().
   * Sets up WS interception and stubs all backend HTTP.
   */
  static async attach(
    page: Page,
    opts: { user?: AuthUser; assets?: AssetDef[] } = {}
  ): Promise<GatewayMock> {
    const mock = new GatewayMock(page);
    const user = opts.user ?? DEFAULT_TRADER;
    const assets = opts.assets ?? DEFAULT_ASSETS;

    // Playwright matches routes in reverse-registration order (last registered wins).
    // Register the catch-all FIRST so specific routes registered after take precedence.

    await page.route("/api/**", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });

    // Stub all service health endpoints — prevents CRITICAL alert banners in screenshots.
    // The transformResponse in servicesApi.ts needs a truthy response with a `version` field.
    await page.route("**/health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", version: "mock" }),
      })
    );

    await page.route("/api/gateway/ready", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ready: true,
          startedAt: Date.now() - 300_000,
          services: {
            bus: true,
            marketSim: true,
            userService: true,
            journal: true,
            ems: true,
            oms: true,
            analytics: true,
            marketData: true,
            featureEngine: true,
            signalEngine: true,
            recommendationEngine: true,
            scenarioEngine: true,
            llmAdvisory: true,
          },
        }),
      })
    );

    // Grid query endpoint — serve mock order store (registered after catch-all = higher priority)
    await page.route("/api/gateway/grid/query", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const rows = Array.from(mock._orders.values()).reverse();
      const body = JSON.stringify({ rows, total: rows.length, evalMs: 0 });
      return route.fulfill({ status: 200, contentType: "application/json", body });
    });

    // Stub advisory request (POST) — default: respond with "disabled" (503)
    // Tests that need a different response can override this route after attach().
    await page.route("/api/gateway/advisory/request", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "LLM advisory is not enabled on this deployment" }),
      });
    });

    // Stub news
    await page.route("/api/news-aggregator/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // Stub orders history (empty — no pre-existing orders)
    await page.route("/api/gateway/orders**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // Stub candles (empty arrays — candle chart shows loading spinner)
    await page.route("/api/gateway/candles**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // Stub assets endpoint
    await page.route("/api/gateway/assets", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(assets) })
    );

    await page.route("/api/gateway/analytics/bond-price", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BOND_PRICE_RESPONSE),
      });
    });

    await page.route("/api/gateway/analytics/spread-analysis", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SPREAD_ANALYSIS_RESPONSE),
      });
    });

    await page.route("/api/gateway/analytics/duration-ladder", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DURATION_LADDER_RESPONSE),
      });
    });

    await page.route("/api/gateway/analytics/vol-surface/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_VOL_SURFACE_RESPONSE),
      })
    );

    await page.route("/api/user-service/sessions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
    );
    await page.route("/api/user-service/sessions/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
    );

    // Intercept WebSocket
    await page.routeWebSocket("/ws/gateway", (ws) => {
      mock._wsRoute = ws;

      ws.onMessage((raw) => {
        try {
          const msg = JSON.parse(raw as string) as GatewayOutbound;

          // Track submitted orders in the internal store and send orderAck back
          if (msg.type === "submitOrder") {
            const p = msg.payload;
            const clientOrderId = p.clientOrderId as string;
            mock._orders.set(clientOrderId, {
              id: clientOrderId,
              clientOrderId,
              submittedAt: Date.now(),
              asset: (p.asset as string) ?? "AAPL",
              side: (p.side as "BUY" | "SELL") ?? "BUY",
              quantity: (p.quantity as number) ?? 0,
              limitPrice: (p.limitPrice as number) ?? 0,
              expiresAt: Date.now() + ((p.expiresAt as number) ?? 60) * 1_000,
              strategy: (p.strategy as string) ?? "LIMIT",
              status: "queued",
              filled: 0,
              algoParams: (p.algoParams as Record<string, unknown>) ?? {},
              children: [],
            });
            // Send orderAck back so the middleware can invalidate the grid cache
            // after the order is recorded in the mock store
            ws.send(JSON.stringify({ event: "orderAck", data: { clientOrderId } }));
          }

          // Settle any waiting promises first
          const idx = mock._outboundResolvers.findIndex((r) => r.type === msg.type);
          if (idx !== -1) {
            const [resolver] = mock._outboundResolvers.splice(idx, 1);
            resolver.resolve(msg);
          } else {
            mock._outboundQueue.push(msg);
          }
        } catch {
          // ignore unparseable
        }
      });
    });

    return mock;
  }

  // ── Send helpers (gateway → client) ────────────────────────────────────────

  private _send(msg: GatewayInbound) {
    this._wsRoute?.send(JSON.stringify(msg));
  }

  /** Send authIdentity — sets user and trading limits in Redux. */
  sendAuthIdentity(opts: { user?: AuthUser; limits?: TradingLimits } = {}) {
    this._send({
      event: "authIdentity",
      data: {
        user: opts.user ?? DEFAULT_TRADER,
        limits: opts.limits ?? DEFAULT_LIMITS,
      },
    });
  }

  sendMarketUpdate(prices: Record<string, number>, volumes?: Record<string, number>) {
    const vols = volumes ?? Object.fromEntries(Object.keys(prices).map((s) => [s, 1000]));
    this._send({ event: "marketUpdate", data: { prices, volumes: vols } });
  }

  sendMarketUpdateWithOpen(openPrices: Record<string, number>, prices: Record<string, number>, volumes?: Record<string, number>) {
    const vols = volumes ?? Object.fromEntries(Object.keys(prices).map((s) => [s, 1000]));
    this._send({ event: "marketUpdate", data: { prices, openPrices, volumes: vols } });
  }

  /** Send an order event on the given topic. */
  sendOrderEvent(topic: string, data: Record<string, unknown>) {
    this._send({ event: "orderEvent", topic, data });
  }

  /**
   * Simulate a full order lifecycle: submitted → routed → filled.
   * Pass the clientOrderId that the frontend used when submitting.
   */
  sendOrderLifecycle(
    clientOrderId: string,
    opts: {
      orderId?: string;
      asset?: string;
      side?: "BUY" | "SELL";
      quantity?: number;
      limitPrice?: number;
      stages?: Array<"submitted" | "routed" | "filled" | "rejected" | "expired">;
    } = {}
  ) {
    const orderId = opts.orderId ?? `ord-${Date.now()}`;
    const asset = opts.asset ?? "AAPL";
    const side = opts.side ?? "BUY";
    const quantity = opts.quantity ?? 100;
    const limitPrice = opts.limitPrice ?? 189.5;
    const stages = opts.stages ?? ["submitted", "routed", "filled"];

    for (const stage of stages) {
      switch (stage) {
        case "submitted":
          this._patchOrder(clientOrderId, { status: "queued" });
          this.sendOrderEvent("orders.submitted", { orderId, clientOrderId, asset, side, quantity, limitPrice, status: "queued" });
          break;
        case "routed":
          this._patchOrder(clientOrderId, { status: "executing" });
          this.sendOrderEvent("orders.routed", { orderId, clientOrderId, strategy: "LIMIT" });
          break;
        case "filled":
          this._patchOrder(clientOrderId, { status: "filled", filled: quantity });
          this.sendOrderEvent("orders.filled", {
            parentOrderId: orderId,
            clientOrderId,
            childId: `child-${Date.now()}`,
            asset,
            side,
            filledQty: quantity,
            remainingQty: 0,
            avgFillPrice: limitPrice,
            venue: "XNAS",
            liquidityFlag: "MAKER",
            commissionUSD: 1.5,
            ts: Date.now(),
          });
          break;
        case "rejected":
          this._patchOrder(clientOrderId, { status: "rejected" });
          this.sendOrderEvent("orders.rejected", { clientOrderId, reason: "Insufficient funds" });
          break;
        case "expired":
          this._patchOrder(clientOrderId, { status: "expired" });
          this.sendOrderEvent("orders.expired", { orderId, clientOrderId });
          break;
      }
    }
  }

  /** Patch an order's fields in the internal store (used to keep grid/query in sync). */
  private _patchOrder(clientOrderId: string, patch: Partial<MockOrder>) {
    const order = this._orders.get(clientOrderId);
    if (order) Object.assign(order, patch);
  }

  injectOrder(opts: {
    asset: string;
    side: "BUY" | "SELL";
    quantity: number;
    limitPrice: number;
    strategy?: string;
    status: "queued" | "executing" | "filled" | "expired" | "rejected";
  }) {
    const clientOrderId = `inj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const orderId = `ord-${clientOrderId}`;
    const order: MockOrder = {
      id: orderId,
      clientOrderId,
      submittedAt: Date.now() - Math.floor(Math.random() * 300_000),
      asset: opts.asset,
      side: opts.side,
      quantity: opts.quantity,
      limitPrice: opts.limitPrice,
      expiresAt: Date.now() + 300_000,
      strategy: opts.strategy ?? "LIMIT",
      status: opts.status,
      filled: opts.status === "filled" ? opts.quantity : 0,
      algoParams: {},
      children: [],
    };
    this._orders.set(clientOrderId, order);
    this.sendOrderEvent("orders.submitted", { orderId, clientOrderId, asset: opts.asset, side: opts.side, quantity: opts.quantity, limitPrice: opts.limitPrice, status: "queued" });
    if (opts.status === "executing" || opts.status === "filled") {
      this.sendOrderEvent("orders.routed", { orderId, clientOrderId, strategy: opts.strategy ?? "LIMIT" });
    }
    if (opts.status === "filled") {
      this.sendOrderEvent("orders.filled", {
        parentOrderId: orderId, clientOrderId, childId: `child-${clientOrderId}`,
        asset: opts.asset, side: opts.side, filledQty: opts.quantity, remainingQty: 0,
        avgFillPrice: opts.limitPrice, venue: "XNAS", liquidityFlag: "MAKER",
        commissionUSD: opts.quantity * 0.003, ts: Date.now(),
      });
    }
    if (opts.status === "expired") {
      this.sendOrderEvent("orders.expired", { orderId, clientOrderId });
    }
    if (opts.status === "rejected") {
      this.sendOrderEvent("orders.rejected", { clientOrderId, reason: "Risk limit exceeded" });
    }
    return clientOrderId;
  }

  /** Send a gateway-level orderRejected (auth failure path). */
  sendOrderRejected(clientOrderId: string, reason = "Unauthenticated") {
    this._patchOrder(clientOrderId, { status: "rejected" });
    this._send({ event: "orderRejected", data: { clientOrderId, reason } });
  }

  /** Send a news item update. */
  sendNewsUpdate(item: {
    id: string;
    symbol: string;
    headline: string;
    source: string;
    url: string;
    publishedAt: number;
    sentiment: "positive" | "negative" | "neutral";
    sentimentScore: number;
    relatedSymbols: string[];
  }) {
    this._send({ event: "newsUpdate", data: item });
  }

  /** Send a signal update (intelligence pipeline output). */
  sendSignalUpdate(signal: Record<string, unknown>) {
    this._send({ event: "signalUpdate", data: signal });
  }

  /** Send a feature vector update (feature-engine output). */
  sendFeatureUpdate(fv: Record<string, unknown>) {
    this._send({ event: "featureUpdate", data: fv });
  }

  /** Send a trade recommendation update. */
  sendRecommendationUpdate(rec: Record<string, unknown>) {
    this._send({ event: "recommendationUpdate", data: rec });
  }

  /** Send an LLM advisory note ready event. */
  sendAdvisoryUpdate(advisory: Record<string, unknown>) {
    this._send({ event: "advisoryUpdate", data: advisory });
  }

  // ── Receive helpers (client → gateway) ─────────────────────────────────────

  /**
   * Wait for the next outbound message of the given type from the client.
   * Resolves with the full message. Rejects after timeout.
   */
  nextOutbound(type: string, timeoutMs = 5_000): Promise<GatewayOutbound> {
    // Check if already buffered
    const idx = this._outboundQueue.findIndex((m) => m.type === type);
    if (idx !== -1) {
      const [msg] = this._outboundQueue.splice(idx, 1);
      return Promise.resolve(msg);
    }
    // Otherwise wait
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const ri = this._outboundResolvers.findIndex((r) => r.resolve === resolve);
        if (ri !== -1) this._outboundResolvers.splice(ri, 1);
        reject(new Error(`Timed out waiting for outbound message type="${type}" after ${timeoutMs}ms`));
      }, timeoutMs);

      this._outboundResolvers.push({
        type,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }
}
