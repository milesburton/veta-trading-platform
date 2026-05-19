import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ServiceHealth } from "@veta/frontend/types.ts";

export interface DiskMetrics {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  used_pct: number;
}

export interface MemoryMetrics {
  rss_mb: number;
  heap_used_mb: number;
  heap_total_mb: number;
  external_mb: number;
}

export interface SystemMetrics {
  disk: DiskMetrics | null;
  diskStatus: "ok" | "critical" | "unavailable";
  diskWarnPct: number;
  memory: MemoryMetrics | null;
}

const _origin = typeof window !== "undefined" ? window.location.origin : "";

// All public health probes go through the gateway's SVC_PROXY. PR #144
// (and later F-17) removed direct Traefik routers for internal services
// — only the gateway, frontend and admin paths are reachable directly,
// so `/api/<svc>/health` no longer routes anywhere and falls through to
// the SPA. The correct path is `/api/gateway/api/<svc>/health`, which
// hits the gateway and is proxied to the named service.
const _api = `${_origin}/api/gateway/api`;

// Traefik dashboard URL is opt-in via env. The fallback used to hardcode
// `${_origin}:8888` which advertised the dashboard port to anyone reading
// the production bundle. The Traefik tile is showOnDeployments=["local"]
// anyway, so production callers never see it — but the string was still in
// the bundle. Now: unset env → empty URL → tile hides itself.
const _traefik = (import.meta.env.VITE_TRAEFIK_DASHBOARD_URL as string | undefined) ?? "";

export const DEPLOYMENT = (import.meta.env.VITE_DEPLOYMENT as string | undefined) ?? "local";

export type ServiceCategory = "core" | "algo" | "data" | "infra" | "observability";

const SERVICES_ALL: {
  name: string;
  url: string;
  link?: string;
  optional?: boolean;
  category: ServiceCategory;
  description: string;
  port: number;
  alertOnDeployments?: string[];
  showOnDeployments?: string[];
}[] = [
  {
    name: "Market Sim",
    url: `${import.meta.env.VITE_MARKET_HTTP_URL ?? `${_api}/market-sim`}/health`,
    link: `${import.meta.env.VITE_MARKET_HTTP_URL ?? `${_api}/market-sim`}/health`,
    category: "core",
    description: "GBM price simulation & synthetic market feed",
    port: 5000,
  },
  {
    name: "EMS",
    url: `${import.meta.env.VITE_EMS_URL ?? `${_api}/ems`}/health`,
    link: `${import.meta.env.VITE_EMS_URL ?? `${_api}/ems`}/health`,
    category: "core",
    description: "Execution management — child order routing & fills",
    port: 5001,
  },
  {
    name: "OMS",
    url: `${import.meta.env.VITE_OMS_URL ?? `${_api}/oms`}/health`,
    link: `${import.meta.env.VITE_OMS_URL ?? `${_api}/oms`}/health`,
    category: "core",
    description: "Order management — validation, RBAC limits & routing",
    port: 5002,
  },
  {
    name: "Gateway",
    url: `${_origin}/api/gateway/health`,
    link: `${_origin}/api/gateway/health`,
    category: "core",
    description: "BFF — single WebSocket + HTTP entry point for the UI",
    port: 5011,
  },
  {
    name: "Limit Algo",
    url: `${import.meta.env.VITE_LIMIT_URL ?? `${_api}/limit-algo`}/health`,
    link: `${import.meta.env.VITE_LIMIT_URL ?? `${_api}/limit-algo`}/health`,
    category: "algo",
    description: "Passive limit order strategy with configurable aggression",
    port: 5003,
  },
  {
    name: "TWAP Algo",
    url: `${import.meta.env.VITE_TWAP_URL ?? `${_api}/twap-algo`}/health`,
    link: `${import.meta.env.VITE_TWAP_URL ?? `${_api}/twap-algo`}/health`,
    category: "algo",
    description: "Time-Weighted Average Price — uniform slice scheduling",
    port: 5004,
  },
  {
    name: "POV Algo",
    url: `${import.meta.env.VITE_POV_URL ?? `${_api}/pov-algo`}/health`,
    link: `${import.meta.env.VITE_POV_URL ?? `${_api}/pov-algo`}/health`,
    category: "algo",
    description: "Percentage of Volume — tracks market participation rate",
    port: 5005,
  },
  {
    name: "VWAP Algo",
    url: `${import.meta.env.VITE_VWAP_URL ?? `${_api}/vwap-algo`}/health`,
    link: `${import.meta.env.VITE_VWAP_URL ?? `${_api}/vwap-algo`}/health`,
    category: "algo",
    description: "Volume-Weighted Average Price — historically-shaped slices",
    port: 5006,
  },
  {
    name: "Iceberg Algo",
    url: `${import.meta.env.VITE_ICEBERG_URL ?? `${_api}/iceberg-algo`}/health`,
    link: `${import.meta.env.VITE_ICEBERG_URL ?? `${_api}/iceberg-algo`}/health`,
    category: "algo",
    description: "Hidden quantity — exposes only visible slice to the market",
    port: 5021,
  },
  {
    name: "Sniper Algo",
    url: `${import.meta.env.VITE_SNIPER_URL ?? `${_api}/sniper-algo`}/health`,
    link: `${import.meta.env.VITE_SNIPER_URL ?? `${_api}/sniper-algo`}/health`,
    category: "algo",
    description: "Opportunistic aggressive fills at favourable price levels",
    port: 5022,
  },
  {
    name: "Arrival Price Algo",
    url: `${import.meta.env.VITE_AP_URL ?? `${_api}/arrival-price-algo`}/health`,
    link: `${import.meta.env.VITE_AP_URL ?? `${_api}/arrival-price-algo`}/health`,
    category: "algo",
    description: "Benchmarks execution against arrival price with slippage control",
    port: 5023,
  },
  {
    name: "IS Algo",
    url: `${import.meta.env.VITE_IS_URL ?? `${_api}/is-algo`}/health`,
    link: `${import.meta.env.VITE_IS_URL ?? `${_api}/is-algo`}/health`,
    category: "algo",
    description: "Implementation Shortfall — balances market impact vs timing risk",
    port: 5026,
  },
  {
    name: "Momentum Algo",
    url: `${import.meta.env.VITE_MOMENTUM_URL ?? `${_api}/momentum-algo`}/health`,
    link: `${import.meta.env.VITE_MOMENTUM_URL ?? `${_api}/momentum-algo`}/health`,
    category: "algo",
    description: "EMA crossover momentum — routes tranches on favourable price signals",
    port: 5025,
  },
  {
    name: "Journal",
    url: `${_api}/journal/health`,
    link: `${_api}/journal/health`,
    category: "data",
    description: "Trade lifecycle store — orders, fills & OHLCV grid",
    port: 5009,
  },
  {
    name: "Analytics",
    url: `${_api}/analytics/health`,
    link: `${_api}/analytics/health`,
    category: "data",
    description: "Black-Scholes pricing, Monte Carlo scenarios & recommendations",
    port: 5014,
  },
  {
    name: "Market Data",
    url: `${_api}/market-data/health`,
    link: `${_api}/market-data/health`,
    category: "data",
    description: "Alpha Vantage polling & per-symbol source overrides",
    port: 5015,
  },
  {
    name: "User Service",
    url: `${_api}/user-service/health`,
    link: `${_api}/user-service/health`,
    category: "infra",
    description: "Session management, RBAC token validation & trading limits",
    port: 5008,
  },
  {
    name: "FIX Gateway",
    url: `${import.meta.env.VITE_FIX_GW_URL ?? `${_api}/fix-gateway`}/health`,
    link: `${import.meta.env.VITE_FIX_GW_URL ?? `${_api}/fix-gateway`}/health`,
    category: "infra",
    description: "WebSocket bridge to FIX exchange (port 9880)",
    port: 9881,
  },
  {
    name: "FIX Archive",
    url: `${_api}/fix-archive/health`,
    link: `${_api}/fix-archive/health`,
    category: "infra",
    description: "Postgres persistence for FIX execution reports",
    port: 5012,
  },
  {
    name: "Traefik",
    // Only meaningful when VITE_TRAEFIK_DASHBOARD_URL is set (local
    // dev). Empty _traefik produces relative-path strings that the
    // health-check fetch will treat as same-origin — which is fine
    // because the Traefik tile is also gated by showOnDeployments=
    // ["local"] and won't render in production.
    url: `${_traefik}/api/overview`,
    link: _traefik,
    optional: true,
    category: "infra",
    description: "Reverse proxy & load balancer dashboard",
    port: 8888,
    alertOnDeployments: ["local"],
    showOnDeployments: ["local"],
  },
  {
    name: "Kafka Relay",
    url: `${_api}/kafka-relay/health`,
    link: `${_api}/kafka-relay/health`,
    optional: true,
    category: "observability",
    description: "Kafka → stdout relay feeding Grafana Alloy / Loki",
    port: 5007,
  },
  {
    name: "Replay",
    url: `${_api}/replay/health`,
    link: `${_api}/replay/health`,
    optional: true,
    category: "observability",
    description: "Session recording and replay",
    port: 5031,
  },
  {
    name: "Risk Engine",
    url: `${_api}/risk-engine/health`,
    link: `${_api}/risk-engine/health`,
    category: "core",
    description: "Real-time pre-trade and post-trade risk checks",
    port: 5032,
  },
  {
    name: "Dark Pool",
    url: `${_api}/dark-pool/health`,
    link: `${_api}/dark-pool/health`,
    category: "core",
    description: "Hidden venue with periodic crossing for size-conscious orders",
    port: 5027,
  },
  {
    name: "CCP Service",
    url: `${_api}/ccp-service/health`,
    link: `${_api}/ccp-service/health`,
    category: "core",
    description: "Central counterparty — novation, margin, settlement lifecycle",
    port: 5028,
  },
  {
    name: "RFQ Service",
    url: `${_api}/rfq-service/health`,
    link: `${_api}/rfq-service/health`,
    category: "core",
    description: "Request-for-quote workflow with dealer responses",
    port: 5029,
  },
  {
    name: "Product Service",
    url: `${_api}/product-service/health`,
    link: `${_api}/product-service/health`,
    category: "core",
    description: "Instrument reference data — symbols, lot sizes, contract specs",
    port: 5030,
  },
  {
    name: "Feature Engine",
    url: `${_api}/feature-engine/health`,
    link: `${_api}/feature-engine/health`,
    category: "data",
    description: "Per-symbol feature vector derivation from price/volume/news",
    port: 5017,
  },
  {
    name: "Signal Engine",
    url: `${_api}/signal-engine/health`,
    link: `${_api}/signal-engine/health`,
    category: "data",
    description: "Buy/sell/neutral signal scoring from feature vectors",
    port: 5018,
  },
  {
    name: "Recommendation Engine",
    url: `${_api}/recommendation-engine/health`,
    link: `${_api}/recommendation-engine/health`,
    category: "data",
    description: "Trade recommendations from signals + position context",
    port: 5019,
  },
  {
    name: "Scenario Engine",
    url: `${_api}/scenario-engine/health`,
    link: `${_api}/scenario-engine/health`,
    category: "data",
    description: "Deterministic scenario replay for backtests and demos",
    port: 5020,
  },
  {
    name: "News Aggregator",
    url: `${_api}/news-aggregator/health`,
    link: `${_api}/news-aggregator/health`,
    category: "data",
    description: "Pulls and tags market news for the feature engine",
    port: 5013,
  },
  {
    name: "LLM Advisory",
    url: `${_api}/llm-advisory/health`,
    link: `${_api}/llm-advisory/health`,
    optional: true,
    category: "data",
    description: "LLM-generated advisory notes for symbols (orchestrator + worker)",
    port: 5024,
  },
];

// Filter out services that are restricted to specific deployments
export const SERVICES = SERVICES_ALL.filter(
  (s) => !s.showOnDeployments || s.showOnDeployments.includes(DEPLOYMENT)
);

export const servicesApi = createApi({
  reducerPath: "servicesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "" }),
  endpoints: (builder) => ({
    getServiceHealth: builder.query<
      ServiceHealth,
      {
        name: string;
        url: string;
        link?: string;
        optional?: boolean;
        alertOnDeployments?: string[];
        showOnDeployments?: string[];
      }
    >({
      query: ({ url }) => ({ url }),
      transformResponse: (body: Record<string, unknown>, _meta, arg) => {
        const { version, ...rest } = body;
        const { service: _s, status: _st, ...meta } = rest;
        return {
          name: arg.name,
          url: arg.url,
          link: arg.link,
          optional: arg.optional,
          alertOnDeployments: arg.alertOnDeployments,
          state: "ok" as const,
          version: String(version ?? "—"),
          meta: meta as Record<string, unknown>,
          lastChecked: Date.now(),
        };
      },
      transformErrorResponse: (_response, _meta, arg) => ({
        name: arg.name,
        url: arg.url,
        link: arg.link,
        optional: arg.optional,
        alertOnDeployments: arg.alertOnDeployments,
        state: "error" as const,
        version: "—",
        meta: {},
        lastChecked: Date.now(),
      }),
    }),
    getSystemMetrics: builder.query<SystemMetrics, void>({
      query: () => ({ url: "/api/gateway/system" }),
    }),
    getDataDepth: builder.query<DataDepth, void>({
      query: () => ({ url: "/api/gateway/data-depth" }),
    }),
  }),
});

export interface DataDepthSymbol {
  instrument: string;
  candleCount: number;
  earliestMs: number;
  latestMs: number;
  spanDays: number;
}

export interface DataDepth {
  totalSymbols: number;
  avgDays: number;
  minDays: number;
  queriedAt: number;
  symbols: DataDepthSymbol[];
}

export const { useGetServiceHealthQuery, useGetSystemMetricsQuery, useGetDataDepthQuery } =
  servicesApi;
