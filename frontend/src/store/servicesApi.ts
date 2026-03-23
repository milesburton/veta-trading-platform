import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ServiceHealth } from "../types.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";

const _traefik =
  import.meta.env.VITE_TRAEFIK_DASHBOARD_URL ?? `${_origin.replace(/:(\d+)$/, "")}:8888`;

export const DEPLOYMENT = (import.meta.env.VITE_DEPLOYMENT as string | undefined) ?? "local";

export type ServiceCategory = "core" | "algo" | "data" | "infra" | "observability";

const SERVICES: {
  name: string;
  url: string;
  link?: string;
  optional?: boolean;
  category: ServiceCategory;
  description: string;
  port: number;
  alertOnDeployments?: string[];
}[] = [
  // ── Core order management ──────────────────────────────────────────────────
  {
    name: "Market Sim",
    url: `${import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`}/health`,
    link: `${import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`}/health`,
    category: "core",
    description: "GBM price simulation & synthetic market feed",
    port: 5000,
  },
  {
    name: "EMS",
    url: `${import.meta.env.VITE_EMS_URL ?? `${_origin}/api/ems`}/health`,
    link: `${import.meta.env.VITE_EMS_URL ?? `${_origin}/api/ems`}/health`,
    category: "core",
    description: "Execution management — child order routing & fills",
    port: 5001,
  },
  {
    name: "OMS",
    url: `${import.meta.env.VITE_OMS_URL ?? `${_origin}/api/oms`}/health`,
    link: `${import.meta.env.VITE_OMS_URL ?? `${_origin}/api/oms`}/health`,
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
  // ── Algo engines ──────────────────────────────────────────────────────────
  {
    name: "Limit Algo",
    url: `${import.meta.env.VITE_LIMIT_URL ?? `${_origin}/api/limit-algo`}/health`,
    link: `${import.meta.env.VITE_LIMIT_URL ?? `${_origin}/api/limit-algo`}/health`,
    category: "algo",
    description: "Passive limit order strategy with configurable aggression",
    port: 5003,
  },
  {
    name: "TWAP Algo",
    url: `${import.meta.env.VITE_TWAP_URL ?? `${_origin}/api/twap-algo`}/health`,
    link: `${import.meta.env.VITE_TWAP_URL ?? `${_origin}/api/twap-algo`}/health`,
    category: "algo",
    description: "Time-Weighted Average Price — uniform slice scheduling",
    port: 5004,
  },
  {
    name: "POV Algo",
    url: `${import.meta.env.VITE_POV_URL ?? `${_origin}/api/pov-algo`}/health`,
    link: `${import.meta.env.VITE_POV_URL ?? `${_origin}/api/pov-algo`}/health`,
    category: "algo",
    description: "Percentage of Volume — tracks market participation rate",
    port: 5005,
  },
  {
    name: "VWAP Algo",
    url: `${import.meta.env.VITE_VWAP_URL ?? `${_origin}/api/vwap-algo`}/health`,
    link: `${import.meta.env.VITE_VWAP_URL ?? `${_origin}/api/vwap-algo`}/health`,
    category: "algo",
    description: "Volume-Weighted Average Price — historically-shaped slices",
    port: 5006,
  },
  {
    name: "Iceberg Algo",
    url: `${import.meta.env.VITE_ICEBERG_URL ?? `${_origin}/api/iceberg-algo`}/health`,
    link: `${import.meta.env.VITE_ICEBERG_URL ?? `${_origin}/api/iceberg-algo`}/health`,
    category: "algo",
    description: "Hidden quantity — exposes only visible slice to the market",
    port: 5021,
  },
  {
    name: "Sniper Algo",
    url: `${import.meta.env.VITE_SNIPER_URL ?? `${_origin}/api/sniper-algo`}/health`,
    link: `${import.meta.env.VITE_SNIPER_URL ?? `${_origin}/api/sniper-algo`}/health`,
    category: "algo",
    description: "Opportunistic aggressive fills at favourable price levels",
    port: 5022,
  },
  {
    name: "Arrival Price Algo",
    url: `${import.meta.env.VITE_AP_URL ?? `${_origin}/api/arrival-price-algo`}/health`,
    link: `${import.meta.env.VITE_AP_URL ?? `${_origin}/api/arrival-price-algo`}/health`,
    category: "algo",
    description: "Benchmarks execution against arrival price with slippage control",
    port: 5023,
  },
  {
    name: "IS Algo",
    url: `${import.meta.env.VITE_IS_URL ?? `${_origin}/api/is-algo`}/health`,
    link: `${import.meta.env.VITE_IS_URL ?? `${_origin}/api/is-algo`}/health`,
    category: "algo",
    description: "Implementation Shortfall — balances market impact vs timing risk",
    port: 5026,
  },
  {
    name: "Momentum Algo",
    url: `${import.meta.env.VITE_MOMENTUM_URL ?? `${_origin}/api/momentum-algo`}/health`,
    link: `${import.meta.env.VITE_MOMENTUM_URL ?? `${_origin}/api/momentum-algo`}/health`,
    category: "algo",
    description: "EMA crossover momentum — routes tranches on favourable price signals",
    port: 5025,
  },
  // ── Data services ─────────────────────────────────────────────────────────
  {
    name: "Journal",
    url: `${_origin}/api/journal/health`,
    link: `${_origin}/api/journal/health`,
    category: "data",
    description: "Trade lifecycle store — orders, fills & OHLCV grid",
    port: 5009,
  },
  {
    name: "Analytics",
    url: `${_origin}/api/analytics/health`,
    link: `${_origin}/api/analytics/health`,
    category: "data",
    description: "Black-Scholes pricing, Monte Carlo scenarios & recommendations",
    port: 5014,
  },
  {
    name: "Market Data",
    url: `${_origin}/api/market-data/health`,
    link: `${_origin}/api/market-data/health`,
    category: "data",
    description: "Alpha Vantage polling & per-symbol source overrides",
    port: 5015,
  },
  // ── Infra ─────────────────────────────────────────────────────────────────
  {
    name: "User Service",
    url: `${_origin}/api/user-service/health`,
    link: `${_origin}/api/user-service/health`,
    category: "infra",
    description: "Session management, RBAC token validation & trading limits",
    port: 5008,
  },
  {
    name: "FIX Gateway",
    url: `${import.meta.env.VITE_FIX_GW_URL ?? `${_origin}/api/fix-gateway`}/health`,
    link: `${import.meta.env.VITE_FIX_GW_URL ?? `${_origin}/api/fix-gateway`}/health`,
    category: "infra",
    description: "WebSocket bridge to FIX exchange (port 9880)",
    port: 9881,
  },
  {
    name: "FIX Archive",
    url: `${_origin}/api/fix-archive/health`,
    link: `${_origin}/api/fix-archive/health`,
    category: "infra",
    description: "Postgres persistence for FIX execution reports",
    port: 5012,
  },
  {
    name: "Traefik",
    url: `${_traefik}/api/overview`,
    link: _traefik,
    optional: true,
    category: "infra",
    description: "Reverse proxy & load balancer dashboard",
    port: 8888,
    alertOnDeployments: ["fly"],
  },
  // ── Observability ─────────────────────────────────────────────────────────
  {
    name: "Kafka Relay",
    url: `${_origin}/api/kafka-relay/health`,
    link: `${_origin}/api/kafka-relay/health`,
    optional: true,
    category: "observability",
    description: "Kafka → stdout relay feeding Grafana Alloy / Loki",
    port: 5007,
  },
  {
    name: "Grafana",
    url: `${import.meta.env.VITE_GRAFANA_URL ?? "http://localhost:3000"}/api/health`,
    link: import.meta.env.VITE_GRAFANA_URL ?? "http://localhost:3000",
    optional: true,
    category: "observability",
    description: "LGTM dashboards — metrics, logs & traces",
    port: 3000,
  },
];

export { SERVICES };

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
  }),
});

export const { useGetServiceHealthQuery } = servicesApi;
