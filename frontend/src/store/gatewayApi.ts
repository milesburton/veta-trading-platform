import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

interface LoadTestRequest {
  orderCount: number;
  strategy: string;
  symbols: string[];
}

export interface LoadTestResult {
  submitted: number;
  symbols: string[];
  strategy: string;
  elapsedMs: number;
}

interface DemoDayRequest {
  scenario: string;
}

export interface DemoDayResult {
  submitted: number;
  scenario: string;
  elapsedMs: number;
}

interface LoadGenConfig {
  ratePerSecond: number;
  strategyMix: ReadonlyArray<{ strategy: string; weight: number }>;
  symbols: ReadonlyArray<string>;
  userIds: ReadonlyArray<string>;
  sizeMin: number;
  sizeMax: number;
  autoStopAfterMs: number;
}

interface LoadGenStatus {
  running: boolean;
  startedAt: number | null;
  stopAt: number | null;
  config: LoadGenConfig | null;
  ordersSent: number;
  ordersFailed: number;
  lastTickAt: number | null;
  lastError: string | null;
}

interface LoadGenStartRequest {
  ratePerSecond?: number;
  symbols?: string[];
  sizeMin?: number;
  sizeMax?: number;
  autoStopAfterMs?: number;
  strategyMix?: ReadonlyArray<{ strategy: string; weight: number }>;
}

export type BugCategory = "ui" | "data" | "auth" | "performance" | "other";
export type TicketKind = "bug" | "feature" | "comment";

export interface BugReportRequest {
  kind?: TicketKind;
  title: string;
  description: string;
  category?: BugCategory;
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

export const gatewayApi = createApi({
  reducerPath: "gatewayApi",
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway",
    credentials: "include",
  }),
  endpoints: (builder) => ({
    runLoadTest: builder.mutation<LoadTestResult, LoadTestRequest>({
      query: (body) => ({
        url: "/load-test",
        method: "POST",
        body,
      }),
    }),
    runDemoDay: builder.mutation<DemoDayResult, DemoDayRequest>({
      query: (body) => ({
        url: "/demo-day",
        method: "POST",
        body,
      }),
    }),
    startLoadGen: builder.mutation<LoadGenStatus, LoadGenStartRequest>({
      query: (body) => ({
        url: "/load-gen/start",
        method: "POST",
        body,
      }),
    }),
    stopLoadGen: builder.mutation<LoadGenStatus, void>({
      query: () => ({
        url: "/load-gen/stop",
        method: "POST",
      }),
    }),
    getLoadGenStatus: builder.query<LoadGenStatus, void>({
      query: () => "/load-gen/status",
    }),
    submitBugReport: builder.mutation<BugReportResponse, BugReportRequest>({
      query: (body) => ({
        url: "/bug-report",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useRunLoadTestMutation,
  useRunDemoDayMutation,
  useStartLoadGenMutation,
  useStopLoadGenMutation,
  useGetLoadGenStatusQuery,
  useSubmitBugReportMutation,
} = gatewayApi;
