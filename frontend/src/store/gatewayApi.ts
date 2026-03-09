import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface LoadTestRequest {
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

export interface DemoDayRequest {
  scenario: string;
}

export interface DemoDayResult {
  submitted: number;
  scenario: string;
  elapsedMs: number;
}

export const gatewayApi = createApi({
  reducerPath: "gatewayApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/gateway", credentials: "include" }),
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
  }),
});

export const { useRunLoadTestMutation, useRunDemoDayMutation } = gatewayApi;
