export interface ServiceCatalogEntry {
  key: string;
  label: string;
  description: string;
}

export const STARTUP_SERVICE_CATALOG: ServiceCatalogEntry[] = [
  {
    key: "gateway",
    label: "Gateway (BFF)",
    description:
      "Single entry point for the UI; proxies HTTP and WebSocket to all backend services",
  },
  {
    key: "bus",
    label: "Message Bus",
    description:
      "Redpanda message bus; event streaming backbone for all inter-service communication",
  },
  {
    key: "marketSim",
    label: "Market Simulator",
    description: "Simulates live equity prices using Geometric Brownian Motion",
  },
  {
    key: "marketData",
    label: "Market Data",
    description: "Polls Alpha Vantage for real prices and applies per-symbol source overrides",
  },
  {
    key: "userService",
    label: "User Service",
    description: "Session management, authentication and per-user trading limits",
  },
  {
    key: "journal",
    label: "Trade Journal",
    description: "Persistent store for orders, fills and OHLCV candlestick data",
  },
  {
    key: "ems",
    label: "Execution Engine",
    description: "Routes child orders to the exchange and records execution fills",
  },
  {
    key: "oms",
    label: "Order Manager",
    description: "Validates orders against RBAC limits and routes to the correct strategy",
  },
  {
    key: "analytics",
    label: "Analytics",
    description:
      "Black-Scholes option pricing, Monte Carlo scenario grid and trade recommendations",
  },
  {
    key: "featureEngine",
    label: "Feature Engine",
    description: "Computes technical indicators (RSI, Bollinger, MACD) from market data streams",
  },
  {
    key: "signalEngine",
    label: "Signal Engine",
    description: "Generates directional buy/sell signals from feature vectors",
  },
  {
    key: "recommendationEngine",
    label: "Recommendation Engine",
    description: "Combines signals into ranked trade recommendations for the UI",
  },
  {
    key: "scenarioEngine",
    label: "Scenario Engine",
    description: "Runs what-if simulations against the current portfolio and market state",
  },
  {
    key: "llmAdvisory",
    label: "LLM Advisory",
    description: "LLM-powered trade commentary and natural-language market insights",
  },
  {
    key: "fixGateway",
    label: "FIX Gateway",
    description: "FIX 4.4 sessions for institutional connectivity",
  },
  {
    key: "fixArchive",
    label: "FIX Archive",
    description: "Persistent FIX message archive for compliance and replay",
  },
  {
    key: "limitAlgo",
    label: "LIMIT Algo",
    description: "Simple limit-order execution strategy",
  },
  {
    key: "twapAlgo",
    label: "TWAP Algo",
    description: "Time-weighted average price execution",
  },
  {
    key: "povAlgo",
    label: "POV Algo",
    description: "Percentage-of-volume participation strategy",
  },
  {
    key: "vwapAlgo",
    label: "VWAP Algo",
    description: "Volume-weighted average price execution",
  },
  {
    key: "icebergAlgo",
    label: "Iceberg Algo",
    description: "Reveals only a small visible quantity at a time",
  },
  {
    key: "sniperAlgo",
    label: "Sniper Algo",
    description: "Multi-venue smart order routing strategy",
  },
  {
    key: "arrivalPriceAlgo",
    label: "Arrival Price Algo",
    description: "Targets the price at order arrival; balances market impact vs urgency",
  },
  {
    key: "momentumAlgo",
    label: "Momentum Algo",
    description: "Trend-following execution with EMA crossovers",
  },
  {
    key: "isAlgo",
    label: "IS Algo",
    description: "Implementation shortfall minimisation",
  },
  {
    key: "darkPool",
    label: "Dark Pool",
    description: "Non-displayed liquidity venue for blocks",
  },
  {
    key: "ccpService",
    label: "CCP",
    description: "Central counterparty clearing for post-trade settlement",
  },
  {
    key: "rfqService",
    label: "RFQ",
    description: "Request-for-quote workflow for fixed income and OTC products",
  },
  {
    key: "productService",
    label: "Product Service",
    description: "Structured-product builder and lifecycle",
  },
  {
    key: "newsAggregator",
    label: "News",
    description: "Aggregates and normalises news from multiple providers",
  },
  {
    key: "observability",
    label: "Observability",
    description: "Auxiliary error and event collection",
  },
];

export const STARTUP_SERVICE_KEYS: readonly string[] = STARTUP_SERVICE_CATALOG.map((s) => s.key);

const BY_KEY: Map<string, ServiceCatalogEntry> = new Map(
  STARTUP_SERVICE_CATALOG.map((s) => [s.key, s])
);

export function catalogEntry(key: string): ServiceCatalogEntry {
  return BY_KEY.get(key) ?? { key, label: key, description: "" };
}
