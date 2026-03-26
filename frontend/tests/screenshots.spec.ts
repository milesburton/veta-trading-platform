/**
 * Screenshot capture spec — generates docs/screenshots/*.png for the README.
 *
 * Each test navigates to a specific workspace/panel combination with mock data
 * and saves a screenshot to docs/screenshots/. The CI screenshots job commits
 * any changed images back to the repository automatically.
 *
 * Run locally:  npx playwright test tests/screenshots.spec.ts
 * Output:       ../docs/screenshots/*.png  (relative to frontend/)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import {
  type AssetDef,
  DEFAULT_ASSETS,
  MOCK_BOND_PRICE_RESPONSE,
  MOCK_DURATION_LADDER_RESPONSE,
  MOCK_SPREAD_ANALYSIS_RESPONSE,
  MOCK_VOL_SURFACE_RESPONSE,
} from "./helpers/GatewayMock.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

const OUT_DIR = path.resolve(fileURLToPath(import.meta.url), "../../../docs/screenshots");

const PRICES = { AAPL: 189.5, MSFT: 421.0, GOOGL: 175.25, AMZN: 224.8, NVDA: 876.4 };
const VOLUMES = { AAPL: 1_200_000, MSFT: 980_000, GOOGL: 760_000, AMZN: 540_000, NVDA: 1_450_000 };

const HEATMAP_ASSETS: AssetDef[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 3000, beta: 1.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2800, beta: 0.9 },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2200, beta: 1.8 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1800, beta: 1.1 },
  { symbol: "META", name: "Meta Platforms", sector: "Technology", exchange: "NASDAQ", marketCapB: 1200, beta: 1.3 },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", exchange: "NYSE", marketCapB: 580, beta: 1.1 },
  { symbol: "BAC", name: "Bank of America", sector: "Financials", exchange: "NYSE", marketCapB: 290, beta: 1.4 },
  { symbol: "GS", name: "Goldman Sachs", sector: "Financials", exchange: "NYSE", marketCapB: 140, beta: 1.5 },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", exchange: "NYSE", marketCapB: 420, beta: 0.6 },
  { symbol: "UNH", name: "UnitedHealth Group", sector: "Healthcare", exchange: "NYSE", marketCapB: 470, beta: 0.7 },
  { symbol: "XOM", name: "ExxonMobil", sector: "Energy", exchange: "NYSE", marketCapB: 480, beta: 1.1 },
  { symbol: "CVX", name: "Chevron Corp.", sector: "Energy", exchange: "NYSE", marketCapB: 290, beta: 1.0 },
];

const HEATMAP_PRICES: Record<string, number> = {
  AAPL: 189.5, MSFT: 421.0, NVDA: 876.4, GOOGL: 175.25, META: 512.3,
  JPM: 198.4, BAC: 38.9, GS: 452.1,
  JNJ: 162.3, UNH: 528.7,
  XOM: 112.4, CVX: 158.9,
};

const HEATMAP_PREV: Record<string, number> = {
  AAPL: 185.2, MSFT: 415.0, NVDA: 845.0, GOOGL: 178.5, META: 498.0,
  JPM: 201.0, BAC: 40.1, GS: 448.0,
  JNJ: 160.0, UNH: 535.0,
  XOM: 115.0, CVX: 155.0,
};

const MOCK_QUOTE = {
  symbol: "AAPL",
  optionType: "call",
  strike: 190,
  expirySecs: 30 * 86400,
  spotPrice: PRICES.AAPL,
  impliedVol: 0.28,
  price: 4.23,
  greeks: { delta: 0.42, gamma: 0.03, theta: -0.08, vega: 0.12, rho: 0.05 },
  computedAt: Date.now(),
};

test.use({ viewport: { width: 1600, height: 900 } });

test("screenshot: trading dashboard", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(600);

  app.gateway.sendNewsUpdate({
    id: "n1",
    symbol: "AAPL",
    headline: "Apple reports record Q1 earnings, beats estimates by 12%",
    source: "Reuters",
    url: "https://example.com",
    publishedAt: Date.now(),
    sentiment: "positive",
    sentimentScore: 0.82,
    relatedSymbols: ["AAPL", "MSFT"],
  });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(OUT_DIR, "01-trading-dashboard.png") });
});

test("screenshot: order ticket with filled order", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(600);

  const ticket = await app.getOrderTicket();
  await ticket.fillOrder({ asset: "AAPL", side: "BUY", quantity: 500, strategy: "TWAP" });

  await page.screenshot({ path: path.join(OUT_DIR, "02-order-ticket.png") });
});

test("screenshot: order blotter with lifecycle", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(600);

  const ticket = await app.getOrderTicket();
  const outboundPromise = app.gateway.nextOutbound("submitOrder");
  await ticket.fillOrder({ asset: "AAPL", side: "BUY", quantity: 500, strategy: "TWAP" });
  await ticket.submit();
  const msg = await outboundPromise;
  const clientOrderId: string = (msg.payload as { clientOrderId: string }).clientOrderId;

  app.gateway.sendOrderLifecycle(clientOrderId, {
    asset: "AAPL",
    quantity: 500,
    limitPrice: PRICES.AAPL,
    stages: ["submitted", "routed", "filled"],
  });

  const blotter = await app.getOrderBlotter();
  await blotter.waitForStatus("filled", 10_000);
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(OUT_DIR, "03-order-blotter.png") });
});

test("screenshot: algo trading workspace", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsAlgoTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(600);

  app.gateway.sendRecommendationUpdate({
    symbol: "AAPL",
    action: "BUY",
    confidence: 0.78,
    reason: "Strong momentum signal with bullish RSI divergence",
    targetPrice: 198.0,
    generatedAt: Date.now(),
  });
  app.gateway.sendRecommendationUpdate({
    symbol: "NVDA",
    action: "BUY",
    confidence: 0.91,
    reason: "AI sector breakout — volume surge above 20-day average",
    targetPrice: 920.0,
    generatedAt: Date.now(),
  });
  app.gateway.sendRecommendationUpdate({
    symbol: "MSFT",
    action: "SELL",
    confidence: 0.65,
    reason: "Overbought on weekly RSI; approaching resistance at 425",
    targetPrice: 405.0,
    generatedAt: Date.now(),
  });
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(OUT_DIR, "04-algo-workspace.png") });
});

test("screenshot: fixed income workspace", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsFiTrader(DEFAULT_ASSETS, "ws-fi-analysis");
  await app.waitForOverlayGone();
  await page.waitForTimeout(300);

  await page.route("/api/gateway/analytics/bond-price", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_BOND_PRICE_RESPONSE),
    }),
  );
  await page.route("/api/gateway/analytics/spread-analysis", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SPREAD_ANALYSIS_RESPONSE),
    }),
  );
  await page.route("/api/gateway/analytics/duration-ladder", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_DURATION_LADDER_RESPONSE),
    }),
  );
  await page.route("/api/gateway/analytics/vol-surface/**", (route) =>
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
  await app.gotoAsTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(400);

  await page.route("/api/gateway/analytics/quote", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_QUOTE),
    }),
  );

  const ticket = await app.getOrderTicket();
  await ticket.switchToOptions();
  await ticket.enterStrikeAndWaitForQuote(190);
  await page.waitForTimeout(400);

  await page.screenshot({ path: path.join(OUT_DIR, "06-option-pricing.png") });
});

test("screenshot: market heatmap", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto({ assets: HEATMAP_ASSETS, url: "/?ws=ws-overview" });
  await app.waitForDashboard();
  app.gateway.sendAuthIdentity({});
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(HEATMAP_PRICES);
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(OUT_DIR, "07-market-heatmap.png") });
});

test("screenshot: kill switch dialog", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: /Kill Switch/i }).click();
  await page.waitForSelector('[data-testid="kill-switch-dialog"]', { timeout: 5_000 });
  await page.waitForTimeout(200);

  await page.screenshot({ path: path.join(OUT_DIR, "08-kill-switch.png") });
});

test("screenshot: column formatting (CF rules)", async ({ page }) => {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);
  await app.waitForOverlayGone();

  app.gateway.sendMarketUpdate(PRICES, VOLUMES);
  await page.waitForTimeout(400);

  const ticket = await app.getOrderTicket();

  const order1Promise = app.gateway.nextOutbound("submitOrder");
  await ticket.fillOrder({ asset: "AAPL", side: "BUY", quantity: 500, strategy: "TWAP" });
  await ticket.submit();
  const msg1 = await order1Promise;
  const id1 = (msg1.payload as { clientOrderId: string }).clientOrderId;
  app.gateway.sendOrderLifecycle(id1, { asset: "AAPL", quantity: 500, limitPrice: PRICES.AAPL, stages: ["submitted", "routed", "filled"] });

  const order2Promise = app.gateway.nextOutbound("submitOrder");
  await ticket.fillOrder({ asset: "MSFT", side: "SELL", quantity: 200, strategy: "LIMIT" });
  await ticket.submit();
  const msg2 = await order2Promise;
  const id2 = (msg2.payload as { clientOrderId: string }).clientOrderId;
  app.gateway.sendOrderLifecycle(id2, { asset: "MSFT", quantity: 200, limitPrice: PRICES.MSFT, stages: ["submitted", "routed"] });

  const order3Promise = app.gateway.nextOutbound("submitOrder");
  await ticket.fillOrder({ asset: "NVDA", side: "BUY", quantity: 100, strategy: "LIMIT" });
  await ticket.submit();
  const msg3 = await order3Promise;
  const id3 = (msg3.payload as { clientOrderId: string }).clientOrderId;
  app.gateway.sendOrderLifecycle(id3, { asset: "NVDA", quantity: 100, limitPrice: PRICES.NVDA, stages: ["submitted", "expired"] });

  const blotter = await app.getOrderBlotter();
  await blotter.waitForStatus("filled", 8_000);
  await page.waitForTimeout(300);

  const blotterPanel = await app.panelByTitle(/Orders.*active/i);
  await blotterPanel.getByRole("button", { name: /Format/i }).click();
  await page.getByText("Conditional Formatting").waitFor({ timeout: 5_000 });
  await page.waitForTimeout(200);

  await page.screenshot({ path: path.join(OUT_DIR, "09-column-formatting.png") });
});
