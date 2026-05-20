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
  }),
});

export const {
  useRunLoadTestMutation,
  useRunDemoDayMutation,
  useStartLoadGenMutation,
  useStopLoadGenMutation,
  useGetLoadGenStatusQuery,
} = gatewayApi;
