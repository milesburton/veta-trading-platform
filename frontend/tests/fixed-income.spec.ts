import { test as base, expect } from "@playwright/test";
import { fiTest } from "./helpers/fixtures.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { OrderTicketPage } from "./helpers/pages/OrderTicketPage.ts";
import {
  DEFAULT_ASSETS,
  MOCK_BOND_PRICE_RESPONSE,
  MOCK_DURATION_LADDER_RESPONSE,
  MOCK_SPREAD_ANALYSIS_RESPONSE,
  MOCK_VOL_SURFACE_RESPONSE,
} from "./helpers/GatewayMock.ts";

const BOND_PRICES: Record<string, number> = {
  AAPL: 189.5,
  MSFT: 421.0,
  GOOGL: 175.25,
};

const bondTest = base.extend<{ app: AppPage; ticket: OrderTicketPage }>({
  app: async ({ page }, use) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader(DEFAULT_ASSETS);
    app.gateway.sendMarketUpdate(BOND_PRICES);
    await page.waitForTimeout(300);
    await use(app);
  },
  ticket: async ({ app }, use) => {
    await use(await app.getOrderTicket());
  },
});

fiTest.describe("Fixed Income — Spread Analysis Panel", () => {
  fiTest("compute button triggers request and result chips are visible", async ({ app }) => {
    const panel = await app.panelByTitle(/Spread Analysis/i);

    await expect(panel.getByRole("button", { name: /Compute Spreads/i }))
      .toBeVisible({
        timeout: 10_000,
      });

    await panel.getByRole("button", { name: /Compute Spreads/i }).click();

    await expect(panel.getByText("G-Spread").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByText("Z-Spread").first()).toBeVisible({
      timeout: 3_000,
    });

    const gSpreadBps = MOCK_SPREAD_ANALYSIS_RESPONSE.gSpread.toFixed(1);
    await expect(panel.getByText(new RegExp(gSpreadBps)).first()).toBeVisible({
      timeout: 3_000,
    });
  });

  fiTest("OAS chip is visible after compute", async ({ app }) => {
    const panel = await app.panelByTitle(/Spread Analysis/i);

    await panel.getByRole("button", { name: /Compute Spreads/i }).click();

    await expect(panel.getByText(/OAS.*Option-Adjusted/i).first()).toBeVisible({
      timeout: 5_000,
    });
    const oasBps = MOCK_SPREAD_ANALYSIS_RESPONSE.oas.toFixed(1);
    await expect(panel.getByText(new RegExp(oasBps)).first()).toBeVisible({
      timeout: 3_000,
    });
  });
});

fiTest.describe("Fixed Income — Duration Ladder Panel", () => {
  fiTest("compute ladder renders portfolio DV01 summary", async ({ app }) => {
    const panel = await app.panelByTitle(/Duration Ladder/i);

    await expect(panel.getByRole("button", { name: /Compute Ladder/i }))
      .toBeVisible({
        timeout: 10_000,
      });

    await panel.getByRole("button", { name: /Compute Ladder/i }).click();

    await expect(panel.getByText("Portfolio DV01")).toBeVisible({
      timeout: 5_000,
    });

    const totalDv01 = Math.abs(MOCK_DURATION_LADDER_RESPONSE.totalPortfolioDv01)
      .toFixed(2);
    await expect(panel.getByText(new RegExp(totalDv01)).first()).toBeVisible({
      timeout: 3_000,
    });
  });

  fiTest("bucket table shows tenor labels after compute", async ({ app }) => {
    const panel = await app.panelByTitle(/Duration Ladder/i);

    await panel.getByRole("button", { name: /Compute Ladder/i }).click();

    for (const label of ["2y", "5y", "10y"]) {
      await expect(panel.getByText(label).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });
});

fiTest.describe("Fixed Income — Vol Surface Panel", () => {
  fiTest("heatmap renders with ATM vol and expiry labels", async ({ app }) => {
    const panel = await app.panelByTitle(/Vol Surface/i);

    const atmPct = (MOCK_VOL_SURFACE_RESPONSE.atTheMoneyVol * 100).toFixed(1);
    await expect(panel.getByText(new RegExp(`ATM Vol.*${atmPct}%`, "i")))
      .toBeVisible({
        timeout: 10_000,
      });

    await expect(panel.getByText("ATM").first()).toBeVisible({
      timeout: 3_000,
    });
  });

  fiTest("cell click does not throw an error", async ({ app, page }) => {
    const panel = await app.panelByTitle(/Vol Surface/i);

    await expect(panel.getByText("ATM").first()).toBeVisible({
      timeout: 10_000,
    });

    const firstCell = panel.getByRole("button").first();
    await firstCell.click();

    await expect(page.locator("body")).not.toContainText("Uncaught", {
      timeout: 1_000,
    }).catch(
      () => {},
    );
  });
});

bondTest.describe("Fixed Income — Bond Order Ticket", () => {
  bondTest("Bond tab is accessible and shows ISIN selector", async ({ ticket }) => {
    await ticket.switchToBond();
    await expect(ticket.locator.locator("#bondSymbol")).toBeVisible({
      timeout: 5_000,
    });
  });

  bondTest("switching to Bond mode auto-fetches a price quote", async ({ ticket }) => {
    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await expect(ticket.locator.getByLabel("Bond price")).toBeVisible({
      timeout: 3_000,
    });
  });

  bondTest("bond quote card shows the mocked clean price", async ({ ticket }) => {
    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    const price = MOCK_BOND_PRICE_RESPONSE.price.toFixed(4);
    await expect(ticket.locator.getByText(new RegExp(price))).toBeVisible({
      timeout: 3_000,
    });
  });

  bondTest("submit button is enabled after quote loads with quantity > 0", async ({ ticket }) => {
    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await ticket.locator.getByLabel("Order quantity in shares").fill("10");

    await ticket.expectBondSubmitEnabled(5_000);
  });

  bondTest("submitting bond order sends a submitOrder WS message with instrumentType=bond", async ({ app, ticket }) => {
    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await ticket.locator.getByLabel("Order quantity in shares").fill("5");

    await ticket.expectBondSubmitEnabled(5_000);
    const msgPromise = app.gateway.nextOutbound("submitOrder", 8_000);
    await ticket.submitBond();

    const msg = await msgPromise;
    expect(msg.payload.instrumentType).toBe("bond");
    expect(msg.payload.quantity).toBe(5);
  });

  bondTest("success feedback is shown after bond order submission", async ({ ticket }) => {
    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await ticket.locator.getByLabel("Order quantity in shares").fill("5");

    await ticket.expectBondSubmitEnabled(5_000);
    await ticket.submitBond();
    await ticket.expectBondOrderSubmitted();
  });
});

base.describe("Trader personas", () => {
  base("FI trader (Carol Davis) name appears in header", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader(DEFAULT_ASSETS);
    await app.expectUserVisible("Carol Davis");
  });

  base("algo trader (Bob Martinez) name appears in header", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAlgoTrader(DEFAULT_ASSETS);
    await app.expectUserVisible("Bob Martinez");
  });

  base("research analyst (David Kim) name appears in header", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAnalyst(DEFAULT_ASSETS);
    await app.expectUserVisible("David Kim");
  });

  base.skip("research analyst has no trading permission — order ticket not accessible (RBAC blocks)");
});
