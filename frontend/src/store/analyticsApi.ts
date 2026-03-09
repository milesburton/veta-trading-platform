import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BondPriceRequest,
  BondPriceResponse,
  GreeksSurfaceResponse,
  OptionQuoteRequest,
  OptionQuoteResponse,
  PriceFanResponse,
  RecommendationRequest,
  RecommendationResponse,
  ScenarioRequest,
  ScenarioResponse,
  VolProfileResponse,
  YieldCurveRequest,
  YieldCurveResponse,
} from "../types/analytics.ts";

export const analyticsApi = createApi({
  reducerPath: "analyticsApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/gateway", credentials: "include" }),
  endpoints: (builder) => ({
    getQuote: builder.mutation<OptionQuoteResponse, OptionQuoteRequest>({
      query: (body) => ({
        url: "/analytics/quote",
        method: "POST",
        body,
      }),
    }),
    getScenario: builder.mutation<ScenarioResponse, ScenarioRequest>({
      query: (body) => ({
        url: "/analytics/scenario",
        method: "POST",
        body,
      }),
    }),
    getRecommendations: builder.mutation<RecommendationResponse, RecommendationRequest>({
      query: (body) => ({
        url: "/analytics/recommend",
        method: "POST",
        body,
      }),
    }),
    getGreeksSurface: builder.query<GreeksSurfaceResponse, { symbol: string; expirySecs?: number }>(
      {
        query: ({ symbol, expirySecs = 30 * 86400 }) =>
          `/analytics/greeks-surface/${encodeURIComponent(symbol)}?expirySecs=${expirySecs}`,
      }
    ),
    getVolProfile: builder.query<VolProfileResponse, string>({
      query: (symbol) => `/analytics/vol-profile/${encodeURIComponent(symbol)}`,
    }),
    getBondPrice: builder.mutation<BondPriceResponse, BondPriceRequest>({
      query: (body) => ({
        url: "/analytics/bond-price",
        method: "POST",
        body,
      }),
    }),
    getYieldCurve: builder.mutation<YieldCurveResponse, YieldCurveRequest>({
      query: (body) => ({
        url: "/analytics/yield-curve",
        method: "POST",
        body,
      }),
    }),
    getPriceFan: builder.query<
      PriceFanResponse,
      { symbol: string; steps?: number; stepSecs?: number; paths?: number }
    >({
      query: ({ symbol, steps = 24, stepSecs = 3600, paths = 500 }) =>
        `/analytics/price-fan/${encodeURIComponent(symbol)}?steps=${steps}&stepSecs=${stepSecs}&paths=${paths}`,
    }),
  }),
});

export const {
  useGetQuoteMutation,
  useGetScenarioMutation,
  useGetRecommendationsMutation,
  useGetGreeksSurfaceQuery,
  useGetVolProfileQuery,
  useGetBondPriceMutation,
  useGetYieldCurveMutation,
  useGetPriceFanQuery,
} = analyticsApi;
