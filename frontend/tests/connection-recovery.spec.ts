import { expect, ladderTest } from "./helpers/fixtures.ts";

ladderTest.describe("Connection recovery — UI must surface stuck state", () => {
  ladderTest("shows a connection-lost banner when the gateway refuses reconnects", async ({
    app,
    page,
  }) => {
    const ladder = await app.getMarketLadder();
    await ladder.waitForSymbol("AAPL");

    app.gateway.sendMarketUpdate({ AAPL: 200 });
    await page.waitForTimeout(400);
    expect(await ladder.rowForSymbol("AAPL").textContent()).not.toContain("—");

    app.gateway.refuseNextConnections(true);
    await app.gateway.dropConnection({ code: 1006 });

    const banner = page.locator('[data-testid="connection-lost-banner"]');
    await expect(banner).toBeVisible({ timeout: 120_000 });
    await expect(banner).toContainText(/connection|disconnected|lost/i);
    await expect(page.locator('[data-testid="connection-lost-reload"]')).toBeVisible();
  });

  ladderTest("Reload button on banner re-attempts the WebSocket", async ({ app, page }) => {
    const ladder = await app.getMarketLadder();
    await ladder.waitForSymbol("AAPL");

    app.gateway.refuseNextConnections(true);
    await app.gateway.dropConnection({ code: 1006 });

    const banner = page.locator('[data-testid="connection-lost-banner"]');
    await expect(banner).toBeVisible({ timeout: 120_000 });

    const beforeReload = app.gateway.connectionCount;
    app.gateway.refuseNextConnections(false);
    await page.locator('[data-testid="connection-lost-reconnect"]').click();

    await expect.poll(() => app.gateway.connectionCount, { timeout: 15_000 }).toBeGreaterThan(
      beforeReload
    );
  });
});
