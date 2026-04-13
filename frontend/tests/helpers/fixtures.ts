import { test as base, expect } from "@playwright/test";
import {
  ALGO_TRADER,
  ALGO_TRADER_LIMITS,
  DEFAULT_ASSETS,
  DEFAULT_LIMITS,
  DEFAULT_TRADER,
  FI_TRADER,
  FI_TRADER_LIMITS,
  GatewayMock,
} from "./GatewayMock.ts";
import { AppPage } from "./pages/AppPage.ts";
import { MarketLadderPage } from "./pages/MarketLadderPage.ts";
import { OrderBlotterPage } from "./pages/OrderBlotterPage.ts";
import { OrderTicketPage } from "./pages/OrderTicketPage.ts";

const PRICES: Record<string, number> = {
  AAPL: 185.5,
  MSFT: 390.0,
  GOOGL: 176.5,
  NVDA: 889.0,
  AMZN: 228.0,
};

interface TradingFixtures {
  app: AppPage;
  gateway: GatewayMock;
  ticket: OrderTicketPage;
  blotter: OrderBlotterPage;
}

interface AlgoFixtures {
  app: AppPage;
  gateway: GatewayMock;
  ticket: OrderTicketPage;
  blotter: OrderBlotterPage;
}

interface FiFixtures {
  app: AppPage;
  gateway: GatewayMock;
}

export const traderTest = base.extend<TradingFixtures>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.gotoAsTrader();
    app.gateway.sendMarketUpdate(PRICES);
    await page.waitForSelector('[data-testid="app-header"]', { timeout: 10_000 });
    await use(app);
  },
  gateway: async ({ app }, use) => {
    await use(app.gateway);
  },
  ticket: async ({ app }, use) => {
    await use(await app.getOrderTicket());
  },
  blotter: async ({ app }, use) => {
    await use(await app.getOrderBlotter());
  },
});

export const algoTest = base.extend<AlgoFixtures>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.goto({
      user: { id: "trader-1", name: "Alice Chen", role: "trader", avatar_emoji: "AL" },
      assets: DEFAULT_ASSETS,
    });
    await app.waitForDashboard();
    app.gateway.sendAuthIdentity({
      limits: {
        ...DEFAULT_LIMITS,
        allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE"],
      },
    });
    app.gateway.sendMarketUpdate(PRICES);
    await page.waitForTimeout(300);
    await use(app);
  },
  gateway: async ({ app }, use) => {
    await use(app.gateway);
  },
  ticket: async ({ app }, use) => {
    await use(await app.getOrderTicket());
  },
  blotter: async ({ app }, use) => {
    await use(await app.getOrderBlotter());
  },
});

export const fiTest = base.extend<FiFixtures>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader(DEFAULT_ASSETS, "ws-fi-analysis");
    app.gateway.sendMarketUpdate(PRICES);
    await page.waitForTimeout(300);
    await use(app);
  },
  gateway: async ({ app }, use) => {
    await use(app.gateway);
  },
});

export { expect, PRICES };
