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
  await ticket.fillOrder({ asset: "AAPL", side: "BUY", qty: "500", strategy: "TWAP" });

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
  await ticket.fillOrder({ asset: "AAPL", side: "BUY", qty: "500", strategy: "TWAP" });
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
