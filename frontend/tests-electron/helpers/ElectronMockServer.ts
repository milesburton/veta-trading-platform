/**
 * ElectronMockServer — lightweight HTTP + WebSocket mock gateway for Electron E2E tests.
 *
 * Playwright's page.route() interception does NOT work for Electron renderer processes
 * loading from file:// URLs. This server runs in the test process and replicates the
 * GatewayMock contract over real TCP so the Electron renderer can connect to it.
 *
 * Usage:
 *   const server = await ElectronMockServer.start(7777);
 *   // ... run tests ...
 *   await server.stop();
 */

import * as http from "http";
import { WebSocketServer, type WebSocket } from "ws";

// ── Auth / asset types (mirror GatewayMock) ───────────────────────────────────

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
  allowed_desks: string[];
  dark_pool_access: boolean;
}

export interface AssetDef {
  symbol: string;
  name: string;
  sector: string;
  exchange?: string;
  marketCapB?: number;
  beta?: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_TRADER: AuthUser = {
  id: "trader-1",
  name: "Alice Chen",
  role: "trader",
  avatar_emoji: "AL",
};

export const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity", "derivatives"],
  dark_pool_access: false,
};

export const DEFAULT_ASSETS: AssetDef[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 3000, beta: 1.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2800, beta: 0.9 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1800, beta: 1.1 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2200, beta: 1.8 },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1900, beta: 1.3 },
];

// ── ElectronMockServer ────────────────────────────────────────────────────────

export class ElectronMockServer {
  private _httpServer: http.Server;
  private _wss: WebSocketServer;
  private _clients = new Set<WebSocket>();
  private _startedAt = Date.now();

  private _user: AuthUser;
  private _limits: TradingLimits;
  private _assets: AssetDef[];

  private constructor(
    httpServer: http.Server,
    wss: WebSocketServer,
    user: AuthUser,
    limits: TradingLimits,
    assets: AssetDef[]
  ) {
    this._httpServer = httpServer;
    this._wss = wss;
    this._user = user;
    this._limits = limits;
    this._assets = assets;
  }

  static async start(
    port: number,
    opts: { user?: AuthUser; limits?: TradingLimits; assets?: AssetDef[] } = {}
  ): Promise<ElectronMockServer> {
    const user = opts.user ?? DEFAULT_TRADER;
    const limits = opts.limits ?? DEFAULT_LIMITS;
    const assets = opts.assets ?? DEFAULT_ASSETS;

    const server = http.createServer();
    const wss = new WebSocketServer({ noServer: true });
    const mock = new ElectronMockServer(server, wss, user, limits, assets);

    server.on("upgrade", (req, socket, head) => {
      if (req.url === "/ws/gateway" || req.url === "/ws") {
        wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
          mock._clients.add(ws);
          ws.on("close", () => mock._clients.delete(ws));
          ws.on("message", (raw) => mock._handleWsMessage(ws, raw.toString()));
          // Send authIdentity immediately on connect
          ws.send(JSON.stringify({
            event: "authIdentity",
            data: { user, limits },
          }));
        });
      } else {
        socket.destroy();
      }
    });

    server.on("request", (req, res) => mock._handleHttp(req, res));

    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

    return mock;
  }

  // ── HTTP handler ──────────────────────────────────────────────────────────

  private _handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url ?? "/";

    // CORS for Electron renderer (origin: null or file://)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // /api/gateway/ready
    if (url.includes("/ready")) {
      json({
        ready: true,
        startedAt: this._startedAt,
        services: {
          bus: true, marketSim: true, userService: true, journal: true,
          ems: true, oms: true, analytics: true, marketData: true,
          featureEngine: true, signalEngine: true, recommendationEngine: true,
          scenarioEngine: true, llmAdvisory: true,
        },
      });
      return;
    }

    // /api/gateway/assets
    if (url.includes("/assets")) {
      json(this._assets);
      return;
    }

    // /api/gateway/candles
    if (url.includes("/candles")) {
      json([]);
      return;
    }

    // /api/gateway/orders
    if (url.includes("/orders")) {
      json([]);
      return;
    }

    // /api/gateway/grid/query
    if (url.includes("/grid/query")) {
      json({ rows: [], total: 0, evalMs: 0 });
      return;
    }

    // /api/user-service/sessions
    if (url.includes("/sessions")) {
      json(this._user);
      return;
    }

    // Catch-all
    json(null);
  }

  // ── WebSocket handler ────────────────────────────────────────────────────

  private _handleWsMessage(ws: WebSocket, raw: string) {
    try {
      const msg = JSON.parse(raw) as { type: string; payload?: Record<string, unknown> };
      if (msg.type === "submitOrder") {
        const clientOrderId = msg.payload?.clientOrderId as string;
        ws.send(JSON.stringify({ event: "orderAck", data: { clientOrderId } }));
      }
    } catch {
      // ignore
    }
  }

  // ── Broadcast helpers ────────────────────────────────────────────────────

  /** Broadcast a message to all connected renderer windows. */
  broadcast(event: string, data: unknown) {
    const msg = JSON.stringify({ event, data });
    for (const ws of this._clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  }

  /** Send a market price update to all connected renderers. */
  sendMarketUpdate(prices: Record<string, number>, volumes?: Record<string, number>) {
    const vols = volumes ?? Object.fromEntries(Object.keys(prices).map((s) => [s, 1_000_000]));
    this.broadcast("marketUpdate", { prices, volumes: vols });
  }

  /** Send an order lifecycle event. */
  sendOrderEvent(topic: string, data: Record<string, unknown>) {
    this.broadcast("orderEvent", { ...data, _topic: topic });
  }

  // ── Teardown ─────────────────────────────────────────────────────────────

  async stop(): Promise<void> {
    for (const ws of this._clients) ws.terminate();
    await new Promise<void>((resolve, reject) => {
      this._wss.close((err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      this._httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
