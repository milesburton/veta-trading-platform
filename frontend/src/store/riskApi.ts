import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface RiskPosition {
  symbol: string;
  netQty: number;
  avgPrice: number;
  costBasis: number;
  markPrice: number;
  unrealisedPnl: number;
  realisedPnl: number;
  totalPnl: number;
  fillCount: number;
}

export interface RiskConfig {
  fatFingerPct: number;
  maxOpenOrders: number;
  duplicateWindowMs: number;
  maxOrdersPerSecond: number;
  maxAdvPct: number;
}

export const riskApi = createApi({
  reducerPath: "riskApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/risk-engine" }),
  tagTypes: ["Positions", "Config"],
  endpoints: (builder) => ({
    getPositions: builder.query<{ positions: Record<string, RiskPosition[]> }, undefined>({
      query: () => "/positions",
      providesTags: ["Positions"],
    }),
    getUserPositions: builder.query<{ userId: string; positions: RiskPosition[] }, string>({
      query: (userId) => `/positions/${encodeURIComponent(userId)}`,
      providesTags: ["Positions"],
    }),
    getRiskConfig: builder.query<RiskConfig, undefined>({
      query: () => "/config",
      providesTags: ["Config"],
    }),
    updateRiskConfig: builder.mutation<RiskConfig, Partial<RiskConfig>>({
      query: (body) => ({ url: "/config", method: "PUT", body }),
      invalidatesTags: ["Config"],
    }),
  }),
});

export const {
  useGetPositionsQuery,
  useGetUserPositionsQuery,
  useGetRiskConfigQuery,
  useUpdateRiskConfigMutation,
} = riskApi;
