/**
 * Shared test constants for the Playwright test suite.
 *
 * Centralises values that are duplicated across GatewayMock, authFixtures,
 * fixtures, and individual spec files so that a single source of truth
 * exists for every mock response and default value.
 */

// ── Auth / User constants ────────────────────────────────────────────────────

export {
  DEFAULT_TRADER,
  ALGO_TRADER,
  FI_TRADER,
  RESEARCH_ANALYST,
  DEFAULT_ADMIN,
  SALES_USER,
  EXTERNAL_CLIENT_USER,
  DEFAULT_LIMITS,
  ALGO_TRADER_LIMITS,
  FI_TRADER_LIMITS,
  ANALYST_LIMITS,
  SALES_LIMITS,
  EXTERNAL_CLIENT_LIMITS,
  DEFAULT_ASSETS,
} from "./authFixtures.ts";

export type { AuthUser, TradingLimits, AssetDef } from "./authFixtures.ts";

// ── Health / Ready helpers ───────────────────────────────────────────────────

/**
 * Standardised gateway-ready response body used by GatewayMock and
 * individual spec files that mock the /api/gateway/ready endpoint.
 */
export function buildReadyBody(extraServices?: Record<string, boolean>): Record<string, unknown> {
  return {
    ready: true,
    startedAt: Date.now() - 300_000,
    upgradeInProgress: false,
    upgradeMessage: null,
    dataDepth: { totalSymbols: 5, avgDays: 3.2, minDays: 1.5, queriedAt: Date.now() },
    services: {
      bus: true,
      marketSim: true,
      userService: true,
      journal: true,
      ems: true,
      oms: true,
      analytics: true,
      marketData: true,
      featureEngine: true,
      signalEngine: true,
      recommendationEngine: true,
      scenarioEngine: true,
      llmAdvisory: true,
      ...extraServices,
    },
  };
}

/**
 * Default ready body (no extra services).
 */
export const DEFAULT_READY_BODY = buildReadyBody();

// ── Market data ──────────────────────────────────────────────────────────────

/**
 * Default live prices that mirror the DEFAULT_ASSETS symbols.
 */
export const PRICES: Record<string, number> = {
  AAPL: 185.5,
  MSFT: 390.0,
  GOOGL: 176.5,
  NVDA: 889.0,
  AMZN: 228.0,
};

/**
 * Default volumes used alongside PRICES in market-update mocks.
 */
export const VOLUMES: Record<string, number> = Object.fromEntries(
  Object.keys(PRICES).map((s) => [s, 1_000])
);

// ── Archetype / Role constants ───────────────────────────────────────────────

/**
 * Sample archetype identifiers used in registration and auth-flow tests.
 */
export const SAMPLE_ARCHETYPE_IDS = {
  trader: "archetype-trader-001",
  analyst: "archetype-analyst-001",
  admin: "archetype-admin-001",
} as const;

/**
 * Sample archetype IDs as an array for iteration in registration tests.
 */
export const SAMPLE_ARCHETYPE_IDS_LIST = ["equity-high-touch", "fi-voice", "derivatives-high-touch"] as const;

// ── Mock analytics responses ─────────────────────────────────────────────────

export const MOCK_BOND_PRICE_RESPONSE = {
  price: 987.43,
  yieldAnnual: 0.0488,
  modifiedDuration: 8.72,
  convexity: 92.4,
  dv01: 0.8618,
  cashFlows: [],
  computedAt: Date.now(),
};

export const MOCK_SPREAD_ANALYSIS_RESPONSE = {
  bondYield: 0.0488,
  tenorYears: 10,
  govSpotRate: 0.0445,
  gSpread: 43.0,
  zSpread: 44.2,
  oas: 44.2,
  computedAt: Date.now(),
};

export const MOCK_DURATION_LADDER_RESPONSE = {
  positions: [
    {
      bondIndex: 0,
      totalDv01: 0.8618,
      modifiedDuration: 8.72,
      contributions: [
        { bondIndex: 0, tenorLabel: "2y", dv01Contribution: 0.12 },
        { bondIndex: 0, tenorLabel: "5y", dv01Contribution: 0.31 },
        { bondIndex: 0, tenorLabel: "10y", dv01Contribution: 0.43 },
      ],
    },
  ],
  buckets: [
    { tenorLabel: "3m", tenorYears: 0.25, netDv01: 0 },
    { tenorLabel: "1y", tenorYears: 1, netDv01: 0 },
    { tenorLabel: "2y", tenorYears: 2, netDv01: 0.12 },
    { tenorLabel: "5y", tenorYears: 5, netDv01: 0.31 },
    { tenorLabel: "10y", tenorYears: 10, netDv01: 0.43 },
    { tenorLabel: "30y", tenorYears: 30, netDv01: 0 },
  ],
  totalPortfolioDv01: 0.8618,
  computedAt: Date.now(),
};

export const MOCK_VOL_SURFACE_RESPONSE = {
  symbol: "AAPL",
  spotPrice: 189.3,
  atTheMoneyVol: 0.25,
  expiries: [7 * 86400, 14 * 86400, 30 * 86400, 60 * 86400, 90 * 86400],
  moneynesses: [0.7, 0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3],
  surface: (() => {
    const expiries = [
      { secs: 7 * 86400, label: "7d" },
      { secs: 14 * 86400, label: "14d" },
      { secs: 30 * 86400, label: "30d" },
      { secs: 60 * 86400, label: "60d" },
      { secs: 90 * 86400, label: "90d" },
    ];
    const moneynesses = [0.7, 0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3];
    const spot = 189.3;
    const atm = 0.25;
    const skew = -0.1;
    const curvature = 0.05;
    return expiries.flatMap(({ secs, label }) =>
      moneynesses.map((m) => {
        const lnM = Math.log(m);
        const iv = Math.max(0.01, atm * (1 + skew * lnM + curvature * lnM * lnM));
        return {
          expirySecs: secs,
          expiryLabel: label,
          moneyness: m,
          strike: Math.round(spot * m * 100) / 100,
          impliedVol: iv,
        };
      })
    );
  })(),
  computedAt: Date.now(),
};
