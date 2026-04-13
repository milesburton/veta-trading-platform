import { traderTest, expect } from "./helpers/fixtures.ts";
import { AppPage } from "./helpers/pages/AppPage.ts";

const AAPL_SIGNAL = {
  symbol: "AAPL",
  score: 0.65,
  direction: "long",
  confidence: 0.65,
  factors: [
    { name: "momentum", weight: 0.25, contribution: 0.25 },
    { name: "relativeVolume", weight: 0.10, contribution: 0.05 },
    { name: "realisedVol", weight: -0.15, contribution: -0.05 },
    { name: "sectorRelativeStrength", weight: 0.20, contribution: 0.15 },
    { name: "eventScore", weight: 0.10, contribution: 0.05 },
    { name: "newsVelocity", weight: 0.10, contribution: 0.08 },
    { name: "sentimentDelta", weight: 0.10, contribution: 0.08 },
  ],
  ts: Date.now(),
};

const MSFT_SIGNAL = {
  symbol: "MSFT",
  score: -0.45,
  direction: "short",
  confidence: 0.45,
  factors: AAPL_SIGNAL.factors.map((f) => ({
    ...f,
    contribution: -f.contribution,
  })),
  ts: Date.now(),
};

const AAPL_FEATURE = {
  symbol: "AAPL",
  ts: Date.now(),
  momentum: 0.03,
  relativeVolume: 1.8,
  realisedVol: 0.22,
  sectorRelativeStrength: 0.01,
  eventScore: 0.5,
  newsVelocity: 3,
  sentimentDelta: 0.4,
};

async function openResearchLayout(app: AppPage) {
  const trigger = app.page.getByTitle("Switch layout template");
  await trigger.click();
  const dropdown = app.page.locator("div.absolute").filter({
    hasText: /Layout Templates/,
  });
  await dropdown.waitFor({ state: "visible", timeout: 5_000 });
  await dropdown.getByRole("button", { name: /factor explainability/i })
    .click();
  await app.page.waitForSelector(".flexlayout__tab_button", {
    timeout: 10_000,
  });
}

async function selectSymbolInRadar(
  page: import("@playwright/test").Page,
  symbol: string,
) {
  const radar = page.locator(".flexlayout__tab", { hasText: /signal radar/i })
    .first();
  await radar.getByText(symbol).first().click();
}

traderTest.describe("Research Radar Panel", () => {
  traderTest("signal bubbles appear when signalUpdate events are received", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendSignalUpdate(MSFT_SIGNAL);

    const radar = page.locator(".flexlayout__tab", { hasText: /signal radar/i })
      .first();
    await expect(radar.locator("circle[data-symbol='AAPL']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(radar.locator("circle[data-symbol='MSFT']")).toBeVisible({
      timeout: 5_000,
    });
  });

  traderTest("long bubble is green and short bubble is red", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendSignalUpdate(MSFT_SIGNAL);

    const radar = page.locator(".flexlayout__tab", { hasText: /signal radar/i })
      .first();

    const aaplCircle = radar.locator("circle[data-symbol='AAPL']");
    const msftCircle = radar.locator("circle[data-symbol='MSFT']");
    await expect(aaplCircle).toBeVisible({ timeout: 5_000 });
    await expect(msftCircle).toBeVisible({ timeout: 5_000 });

    const aaplFill = await aaplCircle.getAttribute("fill");
    const msftFill = await msftCircle.getAttribute("fill");
    expect(aaplFill).toMatch(/#34d399|#10b981|emerald|green/i);
    expect(msftFill).toMatch(/#f87171|#ef4444|red/i);
  });

  traderTest("ranked table shows symbol and direction for each signal", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendSignalUpdate(MSFT_SIGNAL);

    const radar = page.locator(".flexlayout__tab", { hasText: /signal radar/i })
      .first();
    await expect(radar.getByText("AAPL")).toBeVisible({ timeout: 5_000 });
    await expect(radar.getByText("MSFT")).toBeVisible({ timeout: 5_000 });
    await expect(radar.locator("tbody").getByText("long")).toBeVisible({
      timeout: 5_000,
    });
    await expect(radar.locator("tbody").getByText("short")).toBeVisible({
      timeout: 5_000,
    });
  });

  traderTest("second signal for same symbol replaces the first (latest wins)", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);

    gateway.sendSignalUpdate({
      ...AAPL_SIGNAL,
      score: -0.30,
      direction: "short",
      confidence: 0.30,
    });

    const radar = page.locator(".flexlayout__tab", { hasText: /signal radar/i })
      .first();
    await expect(radar.locator("circle[data-symbol='AAPL']")).toHaveAttribute(
      "fill",
      /#f87171|#ef4444/,
      { timeout: 5_000 },
    );
  });

  traderTest("multiple symbols appear independently in the radar", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendSignalUpdate(MSFT_SIGNAL);

    const radar = page.locator(".flexlayout__tab", { hasText: /signal radar/i })
      .first();
    await expect(radar.getByText("AAPL")).toBeVisible({ timeout: 5_000 });
    await expect(radar.getByText("MSFT")).toBeVisible({ timeout: 5_000 });
  });
});

traderTest.describe("Instrument Analysis Panel", () => {
  traderTest("feature bars render when featureUpdate received for selected symbol", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendFeatureUpdate(AAPL_FEATURE);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByText("Momentum")).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText("Rel. Volume")).toBeVisible({
      timeout: 5_000,
    });
  });

  traderTest("signal score value appears in the panel once signal is received", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByText(/0\.6[0-9]/)).toBeVisible({ timeout: 5_000 });
  });
});

traderTest.describe("Signal Explainability Panel", () => {
  traderTest("factor contribution bars and labels render for received signal", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Signal Explainability/i);
    await expect(panel.getByText("Momentum")).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText("Sector RS")).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText(/factor contributions/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  traderTest("final score and confidence percentage display correctly", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Signal Explainability/i);
    await expect(panel.getByText("Final score")).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByText("Confidence")).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText(/65\.0%/)).toBeVisible({ timeout: 5_000 });
  });

  traderTest("weight signs match: realisedVol weight is negative (shown as -)", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Signal Explainability/i);
    await expect(panel.getByText(/weight -0\.15/)).toBeVisible({
      timeout: 5_000,
    });
  });
});

traderTest.describe("AI Advisory Panel", () => {
  traderTest("shows 'Not requested' status and Get Advisory button by default", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendFeatureUpdate(AAPL_FEATURE);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByText("AI Advisory")).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByText("Not requested")).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByRole("button", { name: /get advisory/i }))
      .toBeVisible();
    await expect(panel.getByText(/educational purposes only/i)).toBeVisible();
  });

  traderTest("shows error message when LLM service is disabled (503)", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendFeatureUpdate(AAPL_FEATURE);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByRole("button", { name: /get advisory/i }))
      .toBeVisible({ timeout: 5_000 });
    await panel.getByRole("button", { name: /get advisory/i }).click();

    await expect(
      panel.getByText(
        /failed to request advisory|llm service may not be enabled/i,
      ),
    ).toBeVisible({
      timeout: 5_000,
    });
  });

  traderTest("shows requesting state while advisory POST is in flight", async ({ app, gateway, page }) => {
    let resolveRequest!: () => void;
    const requestHeld = new Promise<void>((res) => {
      resolveRequest = res;
    });
    await page.unroute("/api/gateway/advisory/request");
    await page.route("/api/gateway/advisory/request", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await requestHeld;
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ status: "queued", jobId: "test-job-001" }),
      });
    });

    await openResearchLayout(app);
    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendFeatureUpdate(AAPL_FEATURE);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByRole("button", { name: /get advisory/i }))
      .toBeVisible({ timeout: 5_000 });
    await panel.getByRole("button", { name: /get advisory/i }).click();

    await expect(panel.getByRole("button", { name: /requesting/i }))
      .toBeVisible({ timeout: 5_000 });
    resolveRequest();
  });

  traderTest("renders advisory note content when advisoryUpdate WS event is received", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendFeatureUpdate(AAPL_FEATURE);
    await selectSymbolInRadar(page, "AAPL");

    gateway.sendAdvisoryUpdate({
      jobId: "job-test-001",
      symbol: "AAPL",
      noteId: "note-001",
      content:
        "AAPL shows strong momentum with elevated relative volume. Bullish bias for short-term position.",
      provider: "mock",
      modelId: "mock-model",
      createdAt: Date.now(),
      ts: Date.now(),
    });

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByText(/strong momentum/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByText("Fresh").first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByRole("button", { name: /refresh/i })).toBeVisible({
      timeout: 5_000,
    });
    await expect(panel.getByText(/mock/)).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText(/educational purposes only/i)).toBeVisible();
  });

  traderTest("disclaimer text always visible regardless of advisory state", async ({ app, gateway, page }) => {
    await openResearchLayout(app);

    gateway.sendSignalUpdate(AAPL_SIGNAL);
    gateway.sendFeatureUpdate(AAPL_FEATURE);
    await selectSymbolInRadar(page, "AAPL");

    const panel = await app.panelByTitle(/Instrument Analysis/i);
    await expect(panel.getByText(/not financial advice/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
