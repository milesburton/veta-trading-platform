import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import {
  ALGO_TRADER,
  ALGO_TRADER_LIMITS,
  type AssetDef,
  DEFAULT_ADMIN,
  GatewayMock,
  MOCK_BOND_PRICE_RESPONSE,
  MOCK_DURATION_LADDER_RESPONSE,
  MOCK_SPREAD_ANALYSIS_RESPONSE,
  MOCK_VOL_SURFACE_RESPONSE,
} from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

const OUT_DIR = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../docs/screenshots",
);

test.setTimeout(60_000);

const MARKET_ASSETS: AssetDef[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    exchange: "NASDAQ",
    marketCapB: 3000,
    beta: 1.2,
    peRatio: 32.1,
    dividendYield: 0.005,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    sector: "Technology",
    exchange: "NASDAQ",
    marketCapB: 2800,
    beta: 0.9,
    peRatio: 35.4,
    dividendYield: 0.008,
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    sector: "Technology",
    exchange: "NASDAQ",
    marketCapB: 2200,
    beta: 1.8,
    peRatio: 65.2,
    dividendYield: 0,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    sector: "Technology",
    exchange: "NASDAQ",
    marketCapB: 1800,
    beta: 1.1,
    peRatio: 24.8,
    dividendYield: 0,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    sector: "Consumer Discretionary",
    exchange: "NASDAQ",
    marketCapB: 1900,
    beta: 1.3,
    peRatio: 58.7,
    dividendYield: 0,
  },
  {
    symbol: "META",
    name: "Meta Platforms",
    sector: "Technology",
    exchange: "NASDAQ",
    marketCapB: 1200,
    beta: 1.3,
    peRatio: 28.3,
    dividendYield: 0.004,
  },
  {
    symbol: "JPM",
    name: "JPMorgan Chase",
    sector: "Financials",
    exchange: "NYSE",
    marketCapB: 580,
    beta: 1.1,
    peRatio: 12.1,
    dividendYield: 0.022,
  },
  {
    symbol: "BAC",
    name: "Bank of America",
    sector: "Financials",
    exchange: "NYSE",
    marketCapB: 290,
    beta: 1.4,
    peRatio: 10.8,
    dividendYield: 0.026,
  },
  {
    symbol: "GS",
    name: "Goldman Sachs",
    sector: "Financials",
    exchange: "NYSE",
    marketCapB: 140,
    beta: 1.5,
    peRatio: 15.2,
    dividendYield: 0.021,
  },
  {
    symbol: "JNJ",
    name: "Johnson & Johnson",
    sector: "Healthcare",
    exchange: "NYSE",
    marketCapB: 420,
    beta: 0.6,
    peRatio: 17.5,
    dividendYield: 0.029,
  },
  {
    symbol: "UNH",
    name: "UnitedHealth Group",
    sector: "Healthcare",
    exchange: "NYSE",
    marketCapB: 470,
    beta: 0.7,
    peRatio: 21.3,
    dividendYield: 0.014,
  },
  {
    symbol: "XOM",
    name: "ExxonMobil",
    sector: "Energy",
    exchange: "NYSE",
    marketCapB: 480,
    beta: 1.1,
    peRatio: 13.4,
    dividendYield: 0.033,
  },
  {
    symbol: "CVX",
    name: "Chevron Corp.",
    sector: "Energy",
    exchange: "NYSE",
    marketCapB: 290,
    beta: 1.0,
    peRatio: 14.1,
    dividendYield: 0.038,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    sector: "Consumer Discretionary",
    exchange: "NASDAQ",
    marketCapB: 780,
    beta: 2.1,
    peRatio: 72.5,
    dividendYield: 0,
  },
  {
    symbol: "V",
    name: "Visa Inc.",
    sector: "Financials",
    exchange: "NYSE",
    marketCapB: 550,
    beta: 0.9,
    peRatio: 30.2,
    dividendYield: 0.007,
  },
];

const PRICES: Record<string, number> = {
  AAPL: 192.34,
  MSFT: 418.67,
  NVDA: 889.12,
  GOOGL: 176.89,
  AMZN: 228.45,
  META: 518.90,
  JPM: 201.23,
  BAC: 39.45,
  GS: 458.70,
  JNJ: 159.82,
  UNH: 532.10,
  XOM: 114.56,
  CVX: 161.30,
  TSLA: 178.45,
  V: 289.67,
};

const SESSION_OPEN: Record<string, number> = {
  AAPL: 189.50,
  MSFT: 421.00,
  NVDA: 876.40,
  GOOGL: 175.25,
  AMZN: 224.80,
  META: 512.30,
  JPM: 198.40,
  BAC: 40.10,
  GS: 452.10,
  JNJ: 162.30,
  UNH: 528.70,
  XOM: 112.40,
  CVX: 158.90,
  TSLA: 182.10,
  V: 287.50,
};

const VOLUMES: Record<string, number> = {
  AAPL: 2_400_000,
  MSFT: 1_800_000,
  NVDA: 3_200_000,
  GOOGL: 1_100_000,
  AMZN: 900_000,
  META: 1_500_000,
  JPM: 800_000,
  BAC: 1_200_000,
  GS: 400_000,
  JNJ: 600_000,
  UNH: 500_000,
  XOM: 900_000,
  CVX: 700_000,
  TSLA: 4_100_000,
  V: 650_000,
};

const MOCK_QUOTE = {
  symbol: "AAPL",
  optionType: "call",
  strike: 195,
  expirySecs: 30 * 86400,
  spotPrice: PRICES.AAPL,
  impliedVol: 0.28,
  price: 4.23,
  greeks: { delta: 0.42, gamma: 0.03, theta: -0.08, vega: 0.12, rho: 0.05 },
  computedAt: Date.now(),
};

test.use({ viewport: { width: 1600, height: 900 } });

function seedMarket(app: AppPage) {
  app.gateway.sendMarketUpdateWithOpen(SESSION_OPEN, PRICES, VOLUMES);
}

function seedOrders(app: AppPage) {
  app.gateway.injectOrder({
    asset: "AAPL",
    side: "BUY",
    quantity: 2500,
    strategy: "TWAP",
    limitPrice: 192.34,
    status: "executing",
  });
  app.gateway.injectOrder({
    asset: "NVDA",
    side: "BUY",
    quantity: 150,
    strategy: "LIMIT",
    limitPrice: 885.0,
    status: "filled",
  });
  app.gateway.injectOrder({
    asset: "MSFT",
    side: "SELL",
    quantity: 800,
    strategy: "VWAP",
    limitPrice: 418.67,
    status: "filled",
  });
  app.gateway.injectOrder({
    asset: "TSLA",
    side: "BUY",
    quantity: 1000,
    strategy: "POV",
    limitPrice: 178.45,
    status: "expired",
  });
  app.gateway.injectOrder({
    asset: "JPM",
    side: "SELL",
    quantity: 3000,
    strategy: "LIMIT",
    limitPrice: 205.0,
    status: "rejected",
  });
  app.gateway.injectOrder({
    asset: "AMZN",
    side: "BUY",
    quantity: 1800,
    strategy: "TWAP",
    limitPrice: 228.45,
    status: "filled",
  });
}

test("screenshot: trading dashboard", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(MARKET_ASSETS);
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(600);

  seedOrders(app);

  app.gateway.sendNewsUpdate({
    id: "n1",
    symbol: "NVDA",
    headline: "NVIDIA reports record datacenter revenue, up 154% YoY",
    source: "Reuters",
    url: "https://example.com",
    publishedAt: Date.now() - 120_000,
    sentiment: "positive",
    sentimentScore: 0.91,
    relatedSymbols: ["NVDA", "AMD"],
  });
  app.gateway.sendNewsUpdate({
    id: "n2",
    symbol: "AAPL",
    headline: "Apple Vision Pro sales exceed analyst expectations in Q1",
    source: "Bloomberg",
    url: "https://example.com",
    publishedAt: Date.now() - 300_000,
    sentiment: "positive",
    sentimentScore: 0.74,
    relatedSymbols: ["AAPL"],
  });

  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, "01-trading-dashboard.png"),
  });
});

test("screenshot: order ticket pre-filled", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(MARKET_ASSETS);
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(600);

  const panel = await app.panelByTitle(/(place trades)/i);
  await panel.waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  await panel.screenshot({ path: path.join(OUT_DIR, "02-order-ticket.png") });
});

test("screenshot: order blotter with lifecycle", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(MARKET_ASSETS);
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(600);

  seedOrders(app);
  await page.waitForTimeout(500);

  const panel = await app.panelByTitle(/Orders.*active/i);
  await panel.waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  await panel.screenshot({ path: path.join(OUT_DIR, "03-order-blotter.png") });
});

test("screenshot: algo trading workspace", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsAlgoTrader(MARKET_ASSETS);
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(600);

  app.gateway.injectOrder({
    asset: "AAPL",
    side: "BUY",
    quantity: 5000,
    strategy: "TWAP",
    limitPrice: 192.34,
    status: "executing",
  });
  app.gateway.injectOrder({
    asset: "NVDA",
    side: "BUY",
    quantity: 2000,
    strategy: "VWAP",
    limitPrice: 889.12,
    status: "executing",
  });
  app.gateway.injectOrder({
    asset: "MSFT",
    side: "SELL",
    quantity: 3000,
    strategy: "POV",
    limitPrice: 418.67,
    status: "executing",
  });
  app.gateway.injectOrder({
    asset: "TSLA",
    side: "BUY",
    quantity: 1500,
    strategy: "ICEBERG",
    limitPrice: 178.45,
    status: "executing",
  });
  app.gateway.injectOrder({
    asset: "JPM",
    side: "BUY",
    quantity: 2500,
    strategy: "ARRIVAL_PRICE",
    limitPrice: 201.23,
    status: "filled",
  });
  await page.waitForTimeout(400);

  app.gateway.sendRecommendationUpdate({
    symbol: "NVDA",
    action: "BUY",
    confidence: 0.91,
    reason:
      "AI sector breakout — datacenter revenue up 154% YoY, volume surge above 20-day average",
    targetPrice: 920.0,
    generatedAt: Date.now(),
  });
  app.gateway.sendRecommendationUpdate({
    symbol: "AAPL",
    action: "BUY",
    confidence: 0.78,
    reason:
      "Strong momentum signal with bullish RSI divergence, Vision Pro catalyst",
    targetPrice: 198.0,
    generatedAt: Date.now(),
  });
  app.gateway.sendRecommendationUpdate({
    symbol: "MSFT",
    action: "HOLD",
    confidence: 0.65,
    reason: "Approaching resistance at 425 — wait for earnings confirmation",
    targetPrice: 425.0,
    generatedAt: Date.now(),
  });
  app.gateway.sendRecommendationUpdate({
    symbol: "TSLA",
    action: "SELL",
    confidence: 0.72,
    reason: "Delivery miss — downside risk to 160 if support at 175 breaks",
    targetPrice: 160.0,
    generatedAt: Date.now(),
  });
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(OUT_DIR, "04-algo-workspace.png") });
});

test("screenshot: fixed income workspace", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsFiTrader(MARKET_ASSETS, "ws-fi-analysis");
  await app.waitForOverlayGone();
  await page.waitForTimeout(300);

  await page.route(
    "/api/gateway/analytics/bond-price",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BOND_PRICE_RESPONSE),
      }),
  );
  await page.route(
    "/api/gateway/analytics/spread-analysis",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_SPREAD_ANALYSIS_RESPONSE),
      }),
  );
  await page.route(
    "/api/gateway/analytics/duration-ladder",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DURATION_LADDER_RESPONSE),
      }),
  );
  await page.route(
    "/api/gateway/analytics/vol-surface/**",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_VOL_SURFACE_RESPONSE),
      }),
  );

  const spreadPanel = await app.panelByTitle(/Spread Analysis/i);
  await spreadPanel.getByRole("button", { name: /Compute Spreads/i }).click();
  await spreadPanel.getByText("G-Spread").first().waitFor({ timeout: 5_000 });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(OUT_DIR, "05-fixed-income.png") });
});

test("screenshot: option pricing (Black-Scholes)", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto({ assets: MARKET_ASSETS, url: "/?ws=ws-options" });
  await app.waitForDashboard();
  app.gateway.sendAuthIdentity({
    user: {
      id: "trader-1",
      name: "Alice Chen",
      role: "trader",
      avatar_emoji: "AL",
    },
    limits: {
      max_order_qty: 10_000,
      max_daily_notional: 1_000_000,
      allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
      allowed_desks: ["equity", "derivatives"],
      dark_pool_access: false,
    },
  });
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(400);

  await page.route(
    "/api/gateway/analytics/quote",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_QUOTE),
      }),
  );
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(OUT_DIR, "06-option-pricing.png") });
});

test("screenshot: market heatmap", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto({ user: DEFAULT_ADMIN, assets: MARKET_ASSETS, url: "/?ws=ws-market-feeds" });
  await app.waitForDashboard();
  app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdateWithOpen(SESSION_OPEN, PRICES, VOLUMES);
  await page.waitForTimeout(1000);

  const panel = await app.panelByTitle(/Market Heatmap/i);
  await panel.waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  await panel.screenshot({ path: path.join(OUT_DIR, "07-market-heatmap.png") });
});

test("screenshot: kill switch dialog", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(MARKET_ASSETS);
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(400);

  seedOrders(app);
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: /Kill Switch/i }).click();
  await page.waitForSelector('[data-testid="kill-switch-dialog"]', {
    timeout: 5_000,
  });
  await page.waitForTimeout(200);

  await page.screenshot({ path: path.join(OUT_DIR, "08-kill-switch.png") });
});

test("screenshot: mission control workspace", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto({ user: DEFAULT_ADMIN, assets: MARKET_ASSETS, url: "/?ws=ws-system-status" });
  await app.waitForDashboard();
  app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdateWithOpen(SESSION_OPEN, PRICES, VOLUMES);
  await page.waitForTimeout(600);

  app.gateway.sendNewsUpdate({
    id: "mc1",
    symbol: "NVDA",
    headline: "NVIDIA H200 shipments exceed forecasts, AI infrastructure demand accelerating",
    source: "Reuters",
    url: "https://example.com",
    publishedAt: Date.now() - 180_000,
    sentiment: "positive",
    sentimentScore: 0.88,
    relatedSymbols: ["NVDA", "AMD"],
  });
  app.gateway.sendNewsUpdate({
    id: "mc2",
    symbol: "JPM",
    headline: "Fed signals cautious stance on rate cuts amid sticky inflation data",
    source: "Bloomberg",
    url: "https://example.com",
    publishedAt: Date.now() - 420_000,
    sentiment: "neutral",
    sentimentScore: 0.1,
    relatedSymbols: ["JPM", "BAC", "GS"],
  });
  app.gateway.sendNewsUpdate({
    id: "mc3",
    symbol: "TSLA",
    headline: "Tesla deliveries miss estimates for Q1, production ramp slower than expected",
    source: "CNBC",
    url: "https://example.com",
    publishedAt: Date.now() - 600_000,
    sentiment: "negative",
    sentimentScore: -0.72,
    relatedSymbols: ["TSLA"],
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(OUT_DIR, "10-mission-control.png") });
});

test("screenshot: session replay panel", async ({ page }) => {
  const mockSessions = {
    sessions: [
      {
        id: "sess-2026040501",
        userId: "trader-1",
        userName: "Alice Chen",
        userRole: "trader",
        startedAt: new Date(Date.now() - 7200_000).toISOString(),
        endedAt: new Date(Date.now() - 5400_000).toISOString(),
        durationMs: 1800_000,
        metadata: { userAgent: "Mozilla/5.0", viewport: { w: 1920, h: 1080 } },
      },
      {
        id: "sess-2026040502",
        userId: "algo-1",
        userName: "Bob Martinez",
        userRole: "trader",
        startedAt: new Date(Date.now() - 5400_000).toISOString(),
        endedAt: new Date(Date.now() - 3600_000).toISOString(),
        durationMs: 1800_000,
        metadata: { userAgent: "Mozilla/5.0", viewport: { w: 2560, h: 1440 } },
      },
      {
        id: "sess-2026040503",
        userId: "fi-1",
        userName: "Carol Davis",
        userRole: "trader",
        startedAt: new Date(Date.now() - 3600_000).toISOString(),
        endedAt: new Date(Date.now() - 2400_000).toISOString(),
        durationMs: 1200_000,
        metadata: { userAgent: "Mozilla/5.0", viewport: { w: 1920, h: 1080 } },
      },
      {
        id: "sess-2026040504",
        userId: "admin-1",
        userName: "Sarah Kim",
        userRole: "admin",
        startedAt: new Date(Date.now() - 2400_000).toISOString(),
        endedAt: new Date(Date.now() - 900_000).toISOString(),
        durationMs: 1500_000,
        metadata: { userAgent: "Mozilla/5.0", viewport: { w: 1920, h: 1080 } },
      },
      {
        id: "sess-2026040505",
        userId: "trader-2",
        userName: "David Park",
        userRole: "trader",
        startedAt: new Date(Date.now() - 600_000).toISOString(),
        endedAt: null,
        durationMs: null,
        metadata: { userAgent: "Mozilla/5.0", viewport: { w: 1920, h: 1080 } },
      },
    ],
    total: 5,
  };

  const app = new AppPage(page);
  app.gateway = await GatewayMock.attach(page, { user: DEFAULT_ADMIN });

  await page.unroute("/api/replay/sessions");
  await page.route("/api/replay/sessions**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSessions),
    }),
  );

  await page.unroute("/api/replay/config");
  await page.route("/api/replay/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recordingEnabled: true,
        updatedBy: "admin-1",
        updatedAt: new Date().toISOString(),
      }),
    }),
  );

  await page.route("/api/user-service/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
  await page.route("/api/journal/journal**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ entries: [] }),
    }),
  );

  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("dashboard-layout") || key.startsWith("veta-layout")) {
        localStorage.removeItem(key);
      }
    }
  });
  await page.goto("/?ws=ws-administration");
  await app.waitForDashboard();
  app.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
  await app.waitForOverlayGone();
  await page.waitForTimeout(500);

  const replayTab = page.locator(".flexlayout__tab_button", { hasText: /Session Replay/i }).first();
  await replayTab.click();
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(OUT_DIR, "11-session-replay.png") });
});

test("screenshot: order blotter with formatting", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(MARKET_ASSETS);
  await app.waitForOverlayGone();
  seedMarket(app);
  await page.waitForTimeout(600);

  seedOrders(app);
  app.gateway.injectOrder({
    asset: "META",
    side: "BUY",
    quantity: 500,
    strategy: "LIMIT",
    limitPrice: 518.90,
    status: "filled",
  });
  app.gateway.injectOrder({
    asset: "GS",
    side: "SELL",
    quantity: 200,
    strategy: "TWAP",
    limitPrice: 458.70,
    status: "executing",
  });
  app.gateway.injectOrder({
    asset: "BAC",
    side: "BUY",
    quantity: 5000,
    strategy: "VWAP",
    limitPrice: 39.45,
    status: "filled",
  });
  await page.waitForTimeout(500);

  const panel = await app.panelByTitle(/Orders.*active/i);
  await panel.waitFor({ state: "visible" });
  await page.waitForTimeout(400);

  await panel.getByRole("button", { name: /Format/i }).click();
  await page.waitForTimeout(400);

  await panel.screenshot({
    path: path.join(OUT_DIR, "09-column-formatting.png"),
  });
});
