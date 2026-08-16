import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface FixSessionInfo {
  remote: string;
  counterparty: string | null;
  state: string;
  connectedAt: number;
  openOrders: number;
}

export interface FixExecution {
  execId: string;
  clOrdId: string;
  origClOrdId: string | null;
  symbol: string;
  side: string;
  execType: string;
  ordStatus: string;
  leavesQty: number;
  cumQty: number;
  avgPx: number;
  lastQty: number;
  lastPx: number;
  venue: string | null;
  counterparty: string | null;
  commission: number | null;
  settlDate: string | null;
  account: string | null;
  transactTime: string;
  ts: number;
}

export const fixApi = createApi({
  reducerPath: "fixApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/gateway/api" }),
  tagTypes: ["Sessions", "Executions"],
  endpoints: (builder) => ({
    getFixSessions: builder.query<{ sessions: FixSessionInfo[] }, void>({
      query: () => "/fix-exchange/sessions",
      providesTags: ["Sessions"],
    }),
    getFixExecutions: builder.query<
      FixExecution[],
      { symbol?: string; limit?: number } | undefined
    >({
      query: (args) => ({
        url: "/fix-archive/executions",
        params: args ? { symbol: args.symbol, limit: args.limit } : {},
      }),
      providesTags: ["Executions"],
    }),
  }),
});

export const { useGetFixSessionsQuery, useGetFixExecutionsQuery } = fixApi;
