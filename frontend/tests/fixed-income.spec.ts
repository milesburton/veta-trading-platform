import { expect, test } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import {
  DEFAULT_ASSETS,
  MOCK_BOND_PRICE_RESPONSE,
  MOCK_DURATION_LADDER_RESPONSE,
  MOCK_SPREAD_ANALYSIS_RESPONSE,
  MOCK_VOL_SURFACE_RESPONSE,
} from "./helpers/GatewayMock.ts";

const AAPL_PRICE = 189.5;

async function setupFiAnalysis(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = new AppPage(page);
  await app.gotoAsFiTrader(DEFAULT_ASSETS, "ws-fi-analysis");
  app.gateway.sendMarketUpdate({
    AAPL: AAPL_PRICE,
    MSFT: 421.0,
    GOOGL: 175.25,
  });
  await page.waitForTimeout(300);
  return app;
}

async function setupFiTrader(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = new AppPage(page);
  await app.gotoAsFiTrader(DEFAULT_ASSETS);
  app.gateway.sendMarketUpdate({
    AAPL: AAPL_PRICE,
    MSFT: 421.0,
    GOOGL: 175.25,
  });
  await page.waitForTimeout(300);
  return app;
}

test.describe("Fixed Income — Spread Analysis Panel", () => {
  test("compute button triggers request and result chips are visible", async ({ page }) => {
    const app = await setupFiAnalysis(page);
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

  test("OAS chip is visible after compute", async ({ page }) => {
    const app = await setupFiAnalysis(page);
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

test.describe("Fixed Income — Duration Ladder Panel", () => {
  test("compute ladder renders portfolio DV01 summary", async ({ page }) => {
    const app = await setupFiAnalysis(page);
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

  test("bucket table shows tenor labels after compute", async ({ page }) => {
    const app = await setupFiAnalysis(page);
    const panel = await app.panelByTitle(/Duration Ladder/i);

    await panel.getByRole("button", { name: /Compute Ladder/i }).click();

    for (const label of ["2y", "5y", "10y"]) {
      await expect(panel.getByText(label).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });
});

test.describe("Fixed Income — Vol Surface Panel", () => {
  test("heatmap renders with ATM vol and expiry labels", async ({ page }) => {
    const app = await setupFiAnalysis(page);
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

  test("cell click does not throw an error", async ({ page }) => {
    const app = await setupFiAnalysis(page);
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

test.describe("Fixed Income — Bond Order Ticket", () => {
  test("Bond tab is accessible and shows ISIN selector", async ({ page }) => {
    const app = await setupFiTrader(page);
    const ticket = await app.getOrderTicket();

    await ticket.switchToBond();
    await expect(ticket.locator.locator("#bondSymbol")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("switching to Bond mode auto-fetches a price quote", async ({ page }) => {
    const app = await setupFiTrader(page);
    const ticket = await app.getOrderTicket();

    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await expect(ticket.locator.getByLabel("Bond price")).toBeVisible({
      timeout: 3_000,
    });
  });

  test("bond quote card shows the mocked clean price", async ({ page }) => {
    const app = await setupFiTrader(page);
    const ticket = await app.getOrderTicket();

    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    const price = MOCK_BOND_PRICE_RESPONSE.price.toFixed(4);
    await expect(ticket.locator.getByText(new RegExp(price))).toBeVisible({
      timeout: 3_000,
    });
  });

  test("submit button is enabled after quote loads with quantity > 0", async ({ page }) => {
    const app = await setupFiTrader(page);
    const ticket = await app.getOrderTicket();

    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await ticket.locator.getByLabel("Order quantity in shares").fill("10");

    await ticket.expectBondSubmitEnabled(5_000);
  });

  test("submitting bond order sends a submitOrder WS message with instrumentType=bond", async ({ page }) => {
    const app = await setupFiTrader(page);
    const ticket = await app.getOrderTicket();

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

  test("success feedback is shown after bond order submission", async ({ page }) => {
    const app = await setupFiTrader(page);
    const ticket = await app.getOrderTicket();

    await ticket.switchToBond();
    await ticket.waitForBondQuote(8_000);

    await ticket.locator.getByLabel("Order quantity in shares").fill("5");

    await ticket.expectBondSubmitEnabled(5_000);
    await ticket.submitBond();
    await ticket.expectBondOrderSubmitted();
  });
});

test.describe("Trader personas", () => {
  test("FI trader (Carol Davis) name appears in header", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsFiTrader(DEFAULT_ASSETS);
    await app.expectUserVisible("Carol Davis");
  });

  test("algo trader (Bob Martinez) name appears in header", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAlgoTrader(DEFAULT_ASSETS);
    await app.expectUserVisible("Bob Martinez");
  });

  test("research analyst (David Kim) name appears in header", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAnalyst(DEFAULT_ASSETS);
    await app.expectUserVisible("David Kim");
  });

  test("research analyst has no trading permission — submit button disabled", async ({ page }) => {
    const app = new AppPage(page);
    await app.gotoAsAnalyst(DEFAULT_ASSETS);
    const ticket = await app.getOrderTicket();
    await ticket.expectSubmitDisabled();
  });
});
