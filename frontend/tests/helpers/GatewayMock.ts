import type { Page } from "@playwright/test";
import type { AuthUser, TradingLimits, AssetDef } from "./authFixtures.ts";
import {
  DEFAULT_TRADER,
  DEFAULT_LIMITS,
  DEFAULT_ASSETS,
  DEFAULT_READY_BODY,
  MOCK_BOND_PRICE_RESPONSE,
  MOCK_SPREAD_ANALYSIS_RESPONSE,
  MOCK_DURATION_LADDER_RESPONSE,
  MOCK_VOL_SURFACE_RESPONSE,
} from "./constants.ts";

// ── Re-exports for backward compatibility ──

export {
  DEFAULT_TRADER,
  DEFAULT_LIMITS,
  DEFAULT_ASSETS,
  DEFAULT_READY_BODY,
  MOCK_BOND_PRICE_RESPONSE,
  MOCK_SPREAD_ANALYSIS_RESPONSE,
  MOCK_DURATION_LADDER_RESPONSE,
  MOCK_VOL_SURFACE_RESPONSE,
  ALGO_TRADER,
  FI_TRADER,
  DERIVATIVES_TRADER,
  RESEARCH_ANALYST,
  DEFAULT_ADMIN,
  SALES_USER,
  EXTERNAL_CLIENT_USER,
  ALGO_TRADER_LIMITS,
  FI_TRADER_LIMITS,
  DERIVATIVES_TRADER_LIMITS,
  ANALYST_LIMITS,
  SALES_LIMITS,
  EXTERNAL_CLIENT_LIMITS,
} from "./constants.ts";

// ── Types ────────────────────────────────────────────────────────────────────

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

interface OutboundResolver {
  type: string;
  resolve: (msg: GatewayOutbound) => void;
}

export interface GatewayOutbound {
  type: string;
  payload: Record<string, unknown>;
}

export interface GatewayInbound {
  event: string;
  data: Record<string, unknown>;
}

// ── GatewayMock ──────────────────────────────────────────────────────────────

export class GatewayMock {
  private _wsRoute: WebSocket | null = null;
  private _orders = new Map<string, MockOrder>();
  private _outboundQueue: GatewayOutbound[] = [];
  private _outboundResolvers: OutboundResolver[] = [];
  private _connectionCount = 0;
  private _refuseNextConnections = false;

  get connectionCount(): number {
    return this._connectionCount;
  }

  get orders(): ReadonlyArray<MockOrder> {
    return Array.from(this._orders.values());
  }

  get wsRoute(): WebSocket | null {
    return this._wsRoute;
  }

  constructor(private page: Page) {
    this._wsRoute = null;
  }

  async dropConnection(opts: { code?: number; reason?: string } = {}): Promise<void> {
    if (!this._wsRoute) return;
    await this._wsRoute.close({ code: opts.code ?? 1006, reason: opts.reason ?? "" });
  }

  refuseNextConnections(yes = true): void {
    this._refuseNextConnections = yes;
  }

  static async attach(
    page: Page,
    opts: { user?: AuthUser; assets?: AssetDef[] } = {}
  ): Promise<GatewayMock> {
    const mock = new GatewayMock(page);
    const user = opts.user ?? DEFAULT_TRADER;
    const assets = opts.assets ?? DEFAULT_ASSETS;

    await page.route("/api/**", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });

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
        body: JSON.stringify(DEFAULT_READY_BODY),
      })
    );

    await page.route("/api/gateway/data-depth", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalSymbols: 5,
          avgDays: 3.2,
          minDays: 1.5,
          queriedAt: Date.now(),
          symbols: assets.map((a) => ({
            instrument: a.symbol,
            candleCount: 120,
            earliestMs: Date.now() - 3.2 * 86_400_000,
            latestMs: Date.now(),
            spanDays: 3.2,
          })),
        }),
      })
    );

    await page.route("/api/gateway/grid/query", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const rows = Array.from(mock._orders.values()).reverse();
      const body = JSON.stringify({ rows, total: rows.length, evalMs: 0 });
      return route.fulfill({ status: 200, contentType: "application/json", body });
    });

    await page.route("/api/gateway/advisory/request", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "LLM advisory is not enabled on this deployment" }),
      });
    });

    await page.route("/api/news-aggregator/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    await page.route("/api/gateway/orders**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    await page.route("/api/gateway/candles**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

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

    await page.route("/api/replay/config", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ recordingEnabled: true }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recordingEnabled: false,
          updatedBy: null,
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    await page.route("/api/gateway/api/replay/sessions**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [], total: 0 }),
      })
    );

    await page.route("/api/replay/health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ service: "replay", version: "dev", status: "ok" }),
      })
    );

    await page.route("**/api/user-service/sessions/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
    );

    await page.routeWebSocket("/ws/gateway", (ws) => {
      mock._connectionCount += 1;
      if (mock._refuseNextConnections) {
        void ws.close({ code: 1011, reason: "refused" });
        return;
      }
      mock._wsRoute = ws;

      ws.onMessage((raw) => {
        try {
          const msg = JSON.parse(raw as string) as GatewayOutbound;

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
            ws.send(JSON.stringify({ event: "orderAck", data: { clientOrderId } }));
          }

          const idx = mock._outboundResolvers.findIndex((r) => r.type === msg.type);
          if (idx !== -1) {
            const [resolver] = mock._outboundResolvers.splice(idx, 1);
            resolver.resolve(msg);
          } else {
            mock._outboundQueue.push(msg);
          }
        } catch {}
      });
    });

    return mock;
  }

  private _send(msg: GatewayInbound) {
    this._wsRoute?.send(JSON.stringify(msg));
  }

  sendAuthIdentity(opts: { user?: AuthUser; limits?: TradingLimits } = {}) {
    this._send({
      event: "authIdentity",
      data: {
        user: opts.user ?? DEFAULT_TRADER,
        limits: opts.limits ?? DEFAULT_LIMITS,
      },
    });
  }

  sendUpgradeStatus(inProgress: boolean, message?: string) {
    this._send({ event: "upgradeStatus", data: { inProgress, message: message ?? null } });
  }

  sendMarketUpdate(prices: Record<string, number>, volumes?: Record<string, number>) {
    const vols = volumes ?? Object.fromEntries(Object.keys(prices).map((s) => [s, 1000]));
    this._send({ event: "marketUpdate", data: { prices, volumes: vols } });
  }

  sendMarketUpdateWithOpen(
    openPrices: Record<string, number>,
    prices: Record<string, number>,
    volumes?: Record<string, number>
  ) {
    const vols = volumes ?? Object.fromEntries(Object.keys(prices).map((s) => [s, 1000]));
    this._send({ event: "marketUpdate", data: { prices, openPrices, volumes: vols } });
  }

  sendOrderEvent(topic: string, data: Record<string, unknown>) {
    this._send({ event: "orderEvent", topic, data });
  }

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
          this.sendOrderEvent("orders.submitted", {
            orderId,
            clientOrderId,
            asset,
            side,
            quantity,
            limitPrice,
            status: "queued",
          });
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
    this.sendOrderEvent("orders.submitted", {
      orderId,
      clientOrderId,
      asset: opts.asset,
      side: opts.side,
      quantity: opts.quantity,
      limitPrice: opts.limitPrice,
      status: "queued",
    });
    if (opts.status === "executing" || opts.status === "filled") {
      this.sendOrderEvent("orders.routed", {
        orderId,
        clientOrderId,
        strategy: opts.strategy ?? "LIMIT",
      });
    }
    if (opts.status === "filled") {
      this.sendOrderEvent("orders.filled", {
        parentOrderId: orderId,
        clientOrderId,
        childId: `child-${clientOrderId}`,
        asset: opts.asset,
        side: opts.side,
        filledQty: opts.quantity,
        remainingQty: 0,
        avgFillPrice: opts.limitPrice,
        venue: "XNAS",
        liquidityFlag: "MAKER",
        commissionUSD: opts.quantity * 0.003,
        ts: Date.now(),
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

  sendOrderRejected(clientOrderId: string, reason = "Unauthenticated") {
    this._patchOrder(clientOrderId, { status: "rejected" });
    this._send({ event: "orderRejected", data: { clientOrderId, reason } });
  }

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

  sendSignalUpdate(signal: Record<string, unknown>) {
    this._send({ event: "signalUpdate", data: signal });
  }

  sendFeatureUpdate(fv: Record<string, unknown>) {
    this._send({ event: "featureUpdate", data: fv });
  }

  sendRecommendationUpdate(rec: Record<string, unknown>) {
    this._send({ event: "recommendationUpdate", data: rec });
  }

  sendAdvisoryUpdate(advisory: Record<string, unknown>) {
    this._send({ event: "advisoryUpdate", data: advisory });
  }

  nextOutbound(type: string, timeoutMs = 5_000): Promise<GatewayOutbound> {
    const idx = this._outboundQueue.findIndex((m) => m.type === type);
    if (idx !== -1) {
      const [msg] = this._outboundQueue.splice(idx, 1);
      return Promise.resolve(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const ri = this._outboundResolvers.findIndex((r) => r.resolve === resolve);
        if (ri !== -1) this._outboundResolvers.splice(ri, 1);
        reject(
          new Error(`Timed out waiting for outbound message type="${type}" after ${timeoutMs}ms`)
        );
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
