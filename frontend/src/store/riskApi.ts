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
  maxGrossNotional: number;
  maxDailyLoss: number;
  maxConcentrationPct: number;
  haltMovePercent: number;
  breakerCooldownMs: number;
  breakersEnabled: boolean;
}

export interface ActiveBreaker {
  key: string;
  type: "market-move" | "user-pnl";
  target: string;
  firedAt: number;
  expiresAt: number;
}

export interface BreakerFire {
  type: "market-move" | "user-pnl";
  scope: "symbol" | "user";
  target: string;
  observedValue: number;
  threshold: number;
  firedAt: number;
}

export interface BreakersResponse {
  active: ActiveBreaker[];
  history: BreakerFire[];
  fireCount: number;
  config: {
    cooldownMs: number;
    enabled: boolean;
    haltMovePercent: number;
    maxDailyLoss: number;
  };
}

export const riskApi = createApi({
  reducerPath: "riskApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/risk-engine" }),
  tagTypes: ["Positions", "Config", "Breakers"],
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
    getBreakers: builder.query<BreakersResponse, undefined>({
      query: () => "/breakers",
      providesTags: ["Breakers"],
    }),
  }),
});

export const {
  useGetPositionsQuery,
  useGetUserPositionsQuery,
  useGetRiskConfigQuery,
  useUpdateRiskConfigMutation,
  useGetBreakersQuery,
} = riskApi;
