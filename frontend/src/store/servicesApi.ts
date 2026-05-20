import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { type ServiceSpec as RegistrySpec, SERVICE_REGISTRY } from "@shared/serviceRegistry";
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

interface FrontendServiceSpec {
  name: string;
  url: string;
  link?: string;
  optional?: boolean;
  category: ServiceCategory;
  description: string;
  port: number;
  alertOnDeployments?: readonly string[];
  showOnDeployments?: readonly string[];
}

const ENV = import.meta.env as Record<string, string | undefined>;

function envOverrideForService(spec: RegistrySpec): string | undefined {
  return ENV[`VITE_${spec.envPrefix}_URL`];
}

function specToFrontend(spec: RegistrySpec): FrontendServiceSpec {
  const override = envOverrideForService(spec);
  const baseUrl = override ?? `${_api}/${spec.composeName}`;
  return {
    name: spec.displayName,
    url: `${baseUrl}/health`,
    link: `${baseUrl}/health`,
    optional: spec.optional,
    category: spec.category,
    description: spec.description,
    port: spec.defaultPort,
    alertOnDeployments: spec.alertOnDeployments,
    showOnDeployments: spec.showOnDeployments,
  };
}

const GATEWAY_SPEC: FrontendServiceSpec = {
  name: "Gateway",
  url: `${_origin}/api/gateway/health`,
  link: `${_origin}/api/gateway/health`,
  category: "core",
  description: "BFF — single WebSocket + HTTP entry point for the UI",
  port: 5011,
};

// Traefik dashboard isn't in the gateway's cachedHealth shape (it doesn't
// expose a /health probe to the gateway). The frontend probes it directly
// via the dashboard URL when VITE_TRAEFIK_DASHBOARD_URL is set. The tile
// is hidden in non-local deployments.
const TRAEFIK_SPEC: FrontendServiceSpec = {
  name: "Traefik",
  url: `${_traefik}/api/overview`,
  link: _traefik,
  optional: true,
  category: "infra",
  description: "Reverse proxy & load balancer dashboard",
  port: 8888,
  alertOnDeployments: ["local"],
  showOnDeployments: ["local"],
};

const SERVICES_ALL: readonly FrontendServiceSpec[] = [
  GATEWAY_SPEC,
  ...SERVICE_REGISTRY.filter((s) => !s.excludeFromFrontendServices).map(specToFrontend),
  TRAEFIK_SPEC,
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
        alertOnDeployments?: readonly string[];
        showOnDeployments?: readonly string[];
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
    getPlatformStatus: builder.query<PlatformStatus, void>({
      query: () => ({ url: "/api/gateway/platform-status" }),
    }),
    submitBugReport: builder.mutation<{ ok: boolean }, BugReportSubmission>({
      query: (body) => ({
        url: "/api/gateway/bug-report",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
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

export interface PlatformStatsLastCritical {
  severity: string;
  source: string;
  message: string;
  ts: number;
}

export interface PlatformStatsSnapshot {
  windowStart: number;
  windowEnd: number;
  alertsBySeverity: Record<string, number>;
  bugReports: number;
  uniqueBugReporters: number;
  serviceUpRatio: number | null;
  worstServiceUpRatio: number | null;
  lastCritical: PlatformStatsLastCritical | null;
  lastDeploySha: string | null;
}

export interface PlatformStatus {
  version: string;
  environment: string;
  startedAt: number;
  uptimeMs: number;
  services: Record<string, boolean>;
  stats: PlatformStatsSnapshot;
}

export interface BugReportSubmission {
  title: string;
  description: string;
  category?: "ui" | "data" | "auth" | "performance" | "other";
  url?: string;
}

export const {
  useGetServiceHealthQuery,
  useGetSystemMetricsQuery,
  useGetDataDepthQuery,
  useGetPlatformStatusQuery,
  useSubmitBugReportMutation,
} = servicesApi;
