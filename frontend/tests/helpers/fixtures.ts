import { test as base, expect } from "@playwright/test";
import { DEFAULT_ASSETS, DEFAULT_LIMITS, type GatewayMock } from "./GatewayMock.ts";
import { AppPage } from "./pages/AppPage.ts";
import type { MarketLadderPage } from "./pages/MarketLadderPage.ts";
import type { OrderBlotterPage } from "./pages/OrderBlotterPage.ts";
import type { OrderTicketPage } from "./pages/OrderTicketPage.ts";

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
    // workspace-toolbar (not app-header) marks "dashboard is mounted":
    // app-header is now also present on the login page after the chrome refactor.
    await page.waitForSelector('[data-testid="workspace-toolbar"]', { timeout: 10_000 });
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

interface AdminFixtures {
  app: AppPage;
  gateway: GatewayMock;
}

export const adminTest = base.extend<AdminFixtures>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.gotoAsAdmin();
    await use(app);
  },
  gateway: async ({ app }, use) => {
    await use(app.gateway);
  },
});

interface LadderFixtures {
  app: AppPage;
  gateway: GatewayMock;
  ladder: MarketLadderPage;
}

export const ladderTest = base.extend<LadderFixtures>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.gotoAsTrader(DEFAULT_ASSETS);
    await use(app);
  },
  gateway: async ({ app }, use) => {
    await use(app.gateway);
  },
  ladder: async ({ app }, use) => {
    const ladder = await app.getMarketLadder();
    await ladder.waitForSymbol("AAPL");
    await use(ladder);
  },
});

export { expect, PRICES };
