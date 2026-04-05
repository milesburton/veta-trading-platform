import type { ChannelNumber } from "../../store/channelsSlice.ts";

export type { ChannelNumber };

export const CHANNEL_COLOURS: Record<ChannelNumber, { hex: string; tw: string; label: string }> = {
  1: { hex: "#3b82f6", tw: "blue", label: "Blue" },
  2: { hex: "#22c55e", tw: "green", label: "Green" },
  3: { hex: "#eab308", tw: "yellow", label: "Yellow" },
  4: { hex: "#ef4444", tw: "red", label: "Red" },
  5: { hex: "#a855f7", tw: "purple", label: "Purple" },
  6: { hex: "#f97316", tw: "orange", label: "Orange" },
};

export const PANEL_IDS = [
  "market-ladder",
  "order-ticket",
  "order-blotter",
  "child-orders",
  "algo-monitor",
  "observability",
  "candle-chart",
  "market-depth",
  "executions",
  "decision-log",
  "market-match",
  "admin",
  "news",
  "news-sources",
  "order-progress",
  "market-heatmap",
  "alerts",
  "option-pricing",
  "scenario-matrix",
  "trade-recommendation",
  "market-data-sources",
  "market-feed-control",
  "research-radar",
  "instrument-analysis",
  "signal-explainability",
  "service-health",
  "throughput-gauges",
  "algo-leaderboard",
  "load-test",
  "llm-subsystem",
  "greeks-surface",
  "vol-profile",
  "estate-overview",
  "yield-curve",
  "price-fan",
  "demo-day",
  "spread-analysis",
  "duration-ladder",
  "vol-surface",
  "basket-order",
  "client-rfq",
  "sales-workbench",
  "product-builder",
  "product-book",
  "session-replay",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  "market-ladder": "Market Ladder (live quotes)",
  "order-ticket": "Order Ticket (place trades)",
  "order-blotter": "Orders (active & filled)",
  "child-orders": "Child Orders (executions)",
  "algo-monitor": "Algo Monitor (strategy status)",
  observability: "Observability (system health)",
  "candle-chart": "Price Chart (OHLC history)",
  "market-depth": "Market Depth (bid/ask book)",
  executions: "Executions (trade fills)",
  "decision-log": "Decision Log (algo audit trail)",
  "market-match": "Market Match (trade tape)",
  admin: "Mission Control (system config)",
  news: "News & Signals (market analysis)",
  "news-sources": "News Sources (mission control)",
  "order-progress": "Order Progress (fill tracker)",
  "market-heatmap": "Market Heatmap (sector view)",
  alerts: "Alerts (system notifications)",
  "option-pricing": "Option Pricing (Black-Scholes)",
  "scenario-matrix": "Scenario Matrix (spot/vol shocks)",
  "trade-recommendation": "Trade Recommendations (signal-driven)",
  "market-data-sources": "Market Data Sources (provider config)",
  "market-feed-control": "Market Feed Control (feed health)",
  "research-radar": "Signal Radar (market intelligence)",
  "instrument-analysis": "Instrument Analysis (feature deep-dive)",
  "signal-explainability": "Signal Explainability (factor breakdown)",
  "service-health": "Service Health (system status)",
  "throughput-gauges": "Throughput (pipeline metrics)",
  "algo-leaderboard": "Algo Leaderboard (strategy performance)",
  "load-test": "Load Test (bulk order injection)",
  "llm-subsystem": "LLM Advisory Subsystem (operator controls)",
  "greeks-surface": "Greeks Surface (strike profile)",
  "vol-profile": "Volatility Profile (EWMA trend)",
  "estate-overview": "Estate Overview (command centre)",
  "yield-curve": "Yield Curve (Nelson-Siegel)",
  "price-fan": "Price Fan (GBM projection)",
  "demo-day": "Demo Day (simulate trading session)",
  "spread-analysis": "Spread Analysis (G/Z/OAS)",
  "duration-ladder": "Duration Ladder (DV01 by tenor)",
  "vol-surface": "Vol Surface (implied vol smile)",
  "basket-order": "Basket Order (multi-leg)",
  "client-rfq": "Client RFQ (request for quote)",
  "sales-workbench": "Sales Workbench (RFQ routing)",
  "product-builder": "Product Builder (structured products)",
  "product-book": "Product Book (issued products)",
  "session-replay": "Session Replay",
};

export const PANEL_DESCRIPTIONS: Record<PanelId, string> = {
  "market-ladder":
    "Live asset quotes — click a row to select and broadcast the symbol to linked panels",
  "order-ticket":
    "Submit buy/sell orders — receives the selected symbol from a linked Market Ladder",
  "order-blotter": "History of submitted orders with status, fill price, and P&L",
  "child-orders":
    "Child execution slices for a selected parent order — link to an Order Blotter channel to auto-select. Click a slice to broadcast it to a linked Decision Log.",
  "algo-monitor": "Monitor running algorithmic strategies and their real-time state",
  observability: "System health metrics — latency, throughput, and service status",
  "candle-chart":
    "OHLC candlestick chart with volume — receives the selected symbol from a linked panel",
  "market-depth": "Level 2 order book — bid/ask depth ladder for the selected symbol",
  executions: "Real-time trade execution feed — fills, partial fills, and rejections",
  "decision-log": "Audit trail of algo decision events — signals, triggers, and reasoning",
  "market-match": "Live matched trade tape — recent prints for the selected symbol",
  admin: "Mission Control — system configuration and user management",
  news: "Live market news with sentiment scoring — signals for algo strategies",
  "news-sources":
    "Enable or disable news feed sources for the aggregator service — mission control only",
  "order-progress":
    "Pie charts showing fill progress per active order, plus avg fill rate by strategy",
  "market-heatmap":
    "Sector treemap heatmap — all assets sized by market cap, coloured by % price change. Click a tile to broadcast the symbol.",
  alerts:
    "System alert log — kill switch events, service outages, order rejections and algo heartbeat loss",
  "option-pricing":
    "Black-Scholes European option pricing — theoretical price and full Greeks for calls and puts",
  "scenario-matrix":
    "Spot/vol shock scenario matrix with Monte Carlo distribution — visualise option P&L across market conditions",
  "trade-recommendation":
    "Rule-based option trade recommendations — scored signals with reason codes for all strikes and expiries",
  "market-data-sources":
    "Configure per-symbol market data sources — switch symbols between synthetic GBM and real-world Alpha Vantage prices",
  "market-feed-control":
    "Feed health and market context — global Alpha Vantage pause/resume, exchange market hours, and symbol source overview",
  "research-radar":
    "Signal Radar — all symbols scored by the intelligence pipeline, sized by confidence",
  "instrument-analysis":
    "Per-symbol deep-dive — 7 feature bars, live signal gauge, news timeline, and backtest replay overlay",
  "signal-explainability":
    "Factor contribution waterfall — how each feature drives the current signal score for the selected symbol",
  "service-health":
    "Live health grid for all backend services — status, version, and last-checked age for each service",
  "throughput-gauges":
    "Pipeline throughput metrics — orders/min, fills/min, fill rate, and active strategies from live order flow",
  "algo-leaderboard":
    "Strategy performance leaderboard — fill rate, average slippage, and total filled quantity per algo in the last 5 minutes",
  "load-test":
    "Admin-only bulk order injector — submit configurable volumes of synthetic orders to stress-test the pipeline",
  "llm-subsystem":
    "LLM Advisory Subsystem operator controls — arm/disarm the advisory engine, set trigger mode, and start the worker",
  "greeks-surface":
    "Delta, gamma, theta, and vega across the strike surface — visualise Greeks vs moneyness for any symbol and expiry",
  "vol-profile":
    "EWMA volatility trend (λ=0.94) with rolling baseline — auto-refreshes every 60s to track realised vol evolution",
  "estate-overview":
    "Unified estate command centre — service health chips, throughput gauges, 5-minute event timeline, and live alert feed in one panel",
  "yield-curve":
    "Nelson-Siegel spot yield curve with implied forward rates and bond pricing (price, duration, convexity, DV01)",
  "price-fan":
    "Forward price projection fan chart — GBM Monte Carlo confidence bands (p5/p25/p50/p75/p95) for any equity",
  "demo-day":
    "One-click trading day simulator — injects a realistic wave of mixed-strategy orders across all assets to demonstrate the full pipeline in action",
  "spread-analysis":
    "Credit spread analysis — G-spread, Z-spread, and OAS for corporate bonds relative to the Nelson-Siegel government curve",
  "duration-ladder":
    "Portfolio DV01 attribution ladder — key-rate duration contribution by tenor bucket for a multi-bond fixed income portfolio",
  "vol-surface":
    "Implied volatility surface heatmap — SABR-inspired smile across 5 expiries and 9 strikes; click a cell to prefill the Option Pricing panel",
  "basket-order":
    "Multi-leg basket order builder — set target notional, assign weights per symbol, snap quantities to lot size, and submit all legs as individual orders in one click",
  "client-rfq":
    "Submit and track requests for quote — view indicative prices, confirm or reject dealer quotes",
  "sales-workbench":
    "Review incoming client RFQs, route to pricing, apply markup, and send quotes to clients",
  "product-builder":
    "Build structured products — add equity, bond, and option legs with weights, structure, and issue to the client catalogue",
  "product-book":
    "Browse and manage structured products — view all products by state, request quotes, and track sales",
  "session-replay": "Record and replay user sessions for training and audit",
};

export const SINGLETON_PANELS: ReadonlySet<PanelId> = new Set([
  "order-ticket",
  "order-blotter",
  "observability",
  "executions",
  "admin",
  "news-sources",
  "alerts",
  "market-data-sources",
  "market-feed-control",
  "service-health",
  "throughput-gauges",
  "algo-leaderboard",
  "load-test",
  "llm-subsystem",
  "demo-day",
  "client-rfq",
  "sales-workbench",
  "product-builder",
  "product-book",
  "session-replay",
]);

export interface TabChannelConfig {
  panelType: PanelId;
  outgoing?: ChannelNumber;
  incoming?: ChannelNumber;
  pinned?: boolean;
}

export const PANEL_CHANNEL_CAPS: Record<PanelId, { out: boolean; in: boolean }> = {
  "market-ladder": { out: true, in: false },
  "order-ticket": { out: false, in: true },
  "candle-chart": { out: false, in: true },
  "market-depth": { out: false, in: true },
  "order-blotter": { out: true, in: false },
  "child-orders": { out: true, in: true },
  "algo-monitor": { out: false, in: true },
  observability: { out: false, in: false },
  executions: { out: false, in: true },
  "decision-log": { out: false, in: true },
  "market-match": { out: false, in: true },
  admin: { out: false, in: false },
  news: { out: false, in: false },
  "news-sources": { out: false, in: false },
  "order-progress": { out: false, in: true },
  "market-heatmap": { out: true, in: false },
  alerts: { out: false, in: false },
  "option-pricing": { out: false, in: false },
  "scenario-matrix": { out: false, in: false },
  "trade-recommendation": { out: false, in: false },
  "market-data-sources": { out: false, in: false },
  "market-feed-control": { out: false, in: false },
  "research-radar": { out: true, in: false },
  "instrument-analysis": { out: false, in: true },
  "signal-explainability": { out: false, in: true },
  "service-health": { out: false, in: false },
  "throughput-gauges": { out: false, in: false },
  "algo-leaderboard": { out: false, in: false },
  "load-test": { out: false, in: false },
  "llm-subsystem": { out: false, in: false },
  "greeks-surface": { out: false, in: false },
  "vol-profile": { out: false, in: false },
  "estate-overview": { out: false, in: false },
  "yield-curve": { out: false, in: false },
  "price-fan": { out: false, in: false },
  "demo-day": { out: false, in: false },
  "spread-analysis": { out: false, in: false },
  "duration-ladder": { out: false, in: false },
  "vol-surface": { out: false, in: false },
  "basket-order": { out: false, in: false },
  "client-rfq": { out: false, in: false },
  "sales-workbench": { out: false, in: false },
  "product-builder": { out: false, in: false },
  "product-book": { out: false, in: false },
  "session-replay": { out: false, in: false },
};
