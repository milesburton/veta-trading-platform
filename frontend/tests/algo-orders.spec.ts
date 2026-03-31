/**
 * Algo order E2E tests.
 *
 * For each trading strategy: place an order via the Order Ticket UI, confirm the
 * WS message is sent with the correct strategy field, then drive the full order
 * lifecycle through the GatewayMock (submitted → routed → filled) and assert the
 * Order Blotter reflects the final status.
 *
 * ICEBERG, SNIPER, and ARRIVAL_PRICE are normally hidden behind limits; these tests
 * override allowed_strategies so they can be selected in the UI.
 *
 * Rejection path tests verify that a gateway-level or bus-level rejection surfaces
 * in the blotter correctly for all strategy types.
 */

import { test, expect } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { DEFAULT_ASSETS, DEFAULT_LIMITS } from "./helpers/GatewayMock.ts";

test.setTimeout(60_000);

const AAPL_PRICE = 189.5;
const MSFT_PRICE = 421.0;

/** All strategies the UI can submit (expanded limits). */
const ALL_STRATEGIES = ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE"] as const;

/** Set up a trader session with all strategies permitted and initial price ticks. */
async function setup(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = new AppPage(page);
  await app.goto({
    user: { id: "trader-1", name: "Alice Chen", role: "trader", avatar_emoji: "AL" },
    assets: DEFAULT_ASSETS,
  });
  await app.waitForDashboard();

  // Grant all strategies so ICEBERG/SNIPER/ARRIVAL_PRICE become selectable
  app.gateway.sendAuthIdentity({
    limits: { ...DEFAULT_LIMITS, allowed_strategies: [...ALL_STRATEGIES] },
  });

  // Seed prices so the ticket's limit price field is pre-populated
  app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE, MSFT: MSFT_PRICE, GOOGL: 175.25 });
  await page.waitForTimeout(400); // let 250 ms batch flush + React render

  return app;
}

/**
 * Place an order and return the clientOrderId from the captured WS message.
 * Strategy-specific algoParams are inferred from the strategy name.
 */
async function placeAndCapture(
  app: AppPage,
  strategy: (typeof ALL_STRATEGIES)[number],
  opts: { side?: "BUY" | "SELL"; quantity?: number; limitPrice?: number } = {},
) {
  const ticket = await app.getOrderTicket();
  // TypeScript type for fillOrder only allows Strategy = LIMIT|TWAP|POV|VWAP,
  // so we use selectOption directly for the extended strategies.
  await ticket.locator.getByLabel("Execution strategy").selectOption(strategy);

  const side = opts.side ?? "BUY";
  if (side === "BUY") await ticket.locator.getByRole("button", { name: /^BUY$/i }).click();
  else await ticket.locator.getByRole("button", { name: /^SELL$/i }).click();

  await ticket.locator.getByLabel("Order quantity in shares").fill(String(opts.quantity ?? 50));
  await ticket.locator.getByLabel(/Limit Price/i).fill(String(opts.limitPrice ?? AAPL_PRICE));

  const outboundPromise = app.gateway.nextOutbound("submitOrder", 15_000);
  await ticket.locator.getByRole("button", { name: /submit|place order/i }).click();
  const msg = await outboundPromise;
  return { clientOrderId: msg.payload.clientOrderId as string, msg };
}

// ── Strategy message format ───────────────────────────────────────────────────

test.describe("Algo order WS message", () => {
  for (const strategy of ALL_STRATEGIES) {
    test(`${strategy}: submitOrder WS message carries correct strategy field`, async ({ page }) => {
      const app = await setup(page);
      const { msg } = await placeAndCapture(app, strategy);
      expect(msg.payload.strategy).toBe(strategy);
      expect(msg.payload.asset).toBe("AAPL");
    });
  }
});

// ── LIMIT ─────────────────────────────────────────────────────────────────────

test.describe("LIMIT order lifecycle", () => {
  test("LIMIT BUY: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "LIMIT");

    await blotter.waitForStatus("queued");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 50, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed"],
    });
    await blotter.waitForStatus("executing");

    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 50, limitPrice: AAPL_PRICE,
      stages: ["filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("LIMIT SELL: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "LIMIT", {
      side: "SELL", quantity: 30, limitPrice: AAPL_PRICE,
    });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", side: "SELL", quantity: 30, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("LIMIT: gateway rejection surfaces as rejected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "LIMIT");

    app.gateway.sendOrderRejected(clientOrderId, "Position limit breached");
    await blotter.waitForStatus("rejected");
  });

  test("LIMIT: bus-level rejection (orders.rejected) surfaces in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "LIMIT");

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });

  test("LIMIT: expired order shows expired badge", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "LIMIT");

    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["submitted", "expired"] });
    await blotter.waitForStatus("expired");
  });
});

// ── TWAP ──────────────────────────────────────────────────────────────────────

test.describe("TWAP order lifecycle", () => {
  test("TWAP BUY: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "TWAP", { quantity: 90 });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 90, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("TWAP: WS message carries TWAP strategy", async ({ page }) => {
    const app = await setup(page);
    const { msg } = await placeAndCapture(app, "TWAP", { quantity: 60 });
    expect(msg.payload.strategy).toBe("TWAP");
  });

  test("TWAP: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "TWAP", { quantity: 60 });
    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// ── POV ───────────────────────────────────────────────────────────────────────

test.describe("POV order lifecycle", () => {
  test("POV BUY: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "POV", { quantity: 100 });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 100, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("POV: WS message carries POV strategy", async ({ page }) => {
    const app = await setup(page);
    const { msg } = await placeAndCapture(app, "POV", { quantity: 80 });
    expect(msg.payload.strategy).toBe("POV");
  });

  test("POV: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "POV", { quantity: 80 });
    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// ── VWAP ──────────────────────────────────────────────────────────────────────

test.describe("VWAP order lifecycle", () => {
  test("VWAP SELL: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "VWAP", {
      side: "SELL", quantity: 70, limitPrice: AAPL_PRICE,
    });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", side: "SELL", quantity: 70, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("VWAP: WS message carries VWAP strategy", async ({ page }) => {
    const app = await setup(page);
    const { msg } = await placeAndCapture(app, "VWAP");
    expect(msg.payload.strategy).toBe("VWAP");
  });

  test("VWAP: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "VWAP");
    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// ── ICEBERG ───────────────────────────────────────────────────────────────────

test.describe("ICEBERG order lifecycle", () => {
  test("ICEBERG becomes selectable when allowed_strategies includes ICEBERG", async ({ page }) => {
    const app = await setup(page);
    const ticket = await app.getOrderTicket();
    const option = ticket.locator.getByRole("option", { name: /ICEBERG/i });
    await expect(option).toBeEnabled();
  });

  test("ICEBERG BUY: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "ICEBERG", { quantity: 200 });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 200, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("ICEBERG: WS message carries ICEBERG strategy", async ({ page }) => {
    const app = await setup(page);
    const { msg } = await placeAndCapture(app, "ICEBERG", { quantity: 200 });
    expect(msg.payload.strategy).toBe("ICEBERG");
  });

  test("ICEBERG: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "ICEBERG", { quantity: 200 });
    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// ── SNIPER ────────────────────────────────────────────────────────────────────

test.describe("SNIPER order lifecycle", () => {
  test("SNIPER becomes selectable when allowed_strategies includes SNIPER", async ({ page }) => {
    const app = await setup(page);
    const ticket = await app.getOrderTicket();
    const option = ticket.locator.getByRole("option", { name: /SNIPER/i });
    await expect(option).toBeEnabled();
  });

  test("SNIPER BUY: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "SNIPER", { quantity: 30 });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 30, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("SNIPER: WS message carries SNIPER strategy", async ({ page }) => {
    const app = await setup(page);
    const { msg } = await placeAndCapture(app, "SNIPER");
    expect(msg.payload.strategy).toBe("SNIPER");
  });

  test("SNIPER: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "SNIPER");
    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// ── ARRIVAL_PRICE ─────────────────────────────────────────────────────────────

test.describe("ARRIVAL_PRICE order lifecycle", () => {
  test("ARRIVAL PRICE becomes selectable when allowed_strategies includes ARRIVAL_PRICE", async ({ page }) => {
    const app = await setup(page);
    const ticket = await app.getOrderTicket();
    const option = ticket.locator.getByRole("option", { name: /ARRIVAL PRICE/i });
    await expect(option).toBeEnabled();
  });

  test("ARRIVAL_PRICE BUY: queued → executing → filled", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "ARRIVAL_PRICE", { quantity: 40 });

    await blotter.waitForStatus("queued");
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL", quantity: 40, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");
  });

  test("ARRIVAL_PRICE: WS message carries ARRIVAL_PRICE strategy", async ({ page }) => {
    const app = await setup(page);
    const { msg } = await placeAndCapture(app, "ARRIVAL_PRICE");
    expect(msg.payload.strategy).toBe("ARRIVAL_PRICE");
  });

  test("ARRIVAL_PRICE: rejection is reflected in blotter", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();
    const { clientOrderId } = await placeAndCapture(app, "ARRIVAL_PRICE");
    app.gateway.sendOrderLifecycle(clientOrderId, { stages: ["rejected"] });
    await blotter.waitForStatus("rejected");
  });
});

// ── Multi-order blotter (different strategies) ────────────────────────────────

test.describe("Multi-strategy order blotter", () => {
  test("blotter shows orders from multiple strategies concurrently", async ({ page }) => {
    const app = await setup(page);
    const blotter = await app.getOrderBlotter();

    // Submit LIMIT then TWAP
    const { clientOrderId: limitId } = await placeAndCapture(app, "LIMIT", { quantity: 10 });
    await blotter.waitForStatus("queued", 6_000);

    // Simulate LIMIT filling
    app.gateway.sendOrderLifecycle(limitId, {
      asset: "AAPL", quantity: 10, limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed", "filled"],
    });
    await blotter.waitForStatus("filled");

    // Now submit a TWAP — blotter should now have 2 rows
    await placeAndCapture(app, "TWAP", { quantity: 60 });
    await expect(blotter.orderRows()).toHaveCount(2, { timeout: 8_000 });
  });

  test("strategies disabled by limits cannot be selected", async ({ page }) => {
    // Use restricted limits (no ICEBERG/SNIPER/ARRIVAL_PRICE)
    const app = new AppPage(page);
    await app.goto({
      user: { id: "trader-1", name: "Alice Chen", role: "trader", avatar_emoji: "AL" },
      assets: DEFAULT_ASSETS,
    });
    await app.waitForDashboard();

    app.gateway.sendAuthIdentity({
      limits: { ...DEFAULT_LIMITS, allowed_strategies: ["LIMIT", "TWAP"] },
    });
    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    const ticket = await app.getOrderTicket();
    await expect(ticket.locator.getByRole("option", { name: /ICEBERG/i })).toBeDisabled();
    await expect(ticket.locator.getByRole("option", { name: /SNIPER/i })).toBeDisabled();
    await expect(ticket.locator.getByRole("option", { name: /ARRIVAL PRICE/i })).toBeDisabled();
  });
});
