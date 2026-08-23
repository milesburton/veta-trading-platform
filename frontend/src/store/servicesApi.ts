import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  type ServiceSpec as RegistrySpec,
  SERVICE_REGISTRY,
  type ServiceCategory,
} from "@shared/serviceRegistry";
import type { ServiceHealth } from "@veta/frontend/types.ts";

interface DiskMetrics {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  used_pct: number;
}

interface MemoryMetrics {
  rss_mb: number;
  heap_used_mb: number;
  heap_total_mb: number;
  external_mb: number;
}

interface SystemMetrics {
  disk: DiskMetrics | null;
  diskStatus: "ok" | "critical" | "unavailable";
  diskWarnPct: number;
  memory: MemoryMetrics | null;
}

const _origin = typeof window !== "undefined" ? globalThis.location.origin : "";

const _api = `${_origin}/api/gateway/api`;

const _traefik = (import.meta.env.VITE_TRAEFIK_DASHBOARD_URL as string | undefined) ?? "";

export const DEPLOYMENT = (import.meta.env.VITE_DEPLOYMENT as string | undefined) ?? "local";

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
        // Some infra health surfaces (e.g. Redpanda's admin API
        // /v1/cluster/health_overview) always return 200 and encode
        // degraded state in the body instead of the HTTP status.
        const isHealthy = body.is_healthy;
        const state = isHealthy === false ? ("warn" as const) : ("ok" as const);
        return {
          name: arg.name,
          url: arg.url,
          link: arg.link,
          optional: arg.optional,
          alertOnDeployments: arg.alertOnDeployments,
          state,
          version: String(version ?? "—"),
          meta: meta as Record<string, unknown>,
          lastChecked: Date.now(),
        };
      },
      transformErrorResponse: (response, _meta, arg) => {
        // A service can report 503 deliberately to signal a degraded-but-
        // running warn state (e.g. disk-monitor crossing WARN_PCT) rather
        // than being unreachable. Only treat that specific shape as "warn";
        // every other non-2xx or network failure is a genuine "error".
        const data =
          typeof response.status === "number" && response.data && typeof response.data === "object"
            ? (response.data as Record<string, unknown>)
            : null;
        const isWarn = response.status === 503 && data?.status === "critical";
        return {
          name: arg.name,
          url: arg.url,
          link: arg.link,
          optional: arg.optional,
          alertOnDeployments: arg.alertOnDeployments,
          state: isWarn ? ("warn" as const) : ("error" as const),
          version: "—",
          meta: (data ?? {}) as Record<string, unknown>,
          lastChecked: Date.now(),
        };
      },
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
    submitBugReport: builder.mutation<BugReportResponse, BugReportSubmission>({
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

interface DataDepth {
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
  ticketing: {
    state:
      | "unknown"
      | "healthy"
      | "missing"
      | "misconfigured"
      | "unauthorised"
      | "forbidden"
      | "rate-limited"
      | "unreachable";
    healthy: boolean;
    checkedAt: number | null;
    statusCode: number | null;
    repo: string | null;
  };
}

export interface BugReportSubmission {
  kind?: "bug" | "feature" | "comment";
  title: string;
  description: string;
  category?: "ui" | "data" | "auth" | "performance" | "other";
  url?: string;
}

export interface BugReportResponse {
  ok: boolean;
  discordDelivered?: boolean;
  ticket?: {
    created: boolean;
    issueNumber: number | null;
    url: string | null;
    reason: string | null;
  };
  error?: string;
}

export const {
  useGetServiceHealthQuery,
  useGetSystemMetricsQuery,
  useGetDataDepthQuery,
  useGetPlatformStatusQuery,
  useSubmitBugReportMutation,
} = servicesApi;
