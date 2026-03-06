import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  OptionQuoteRequest,
  OptionQuoteResponse,
  RecommendationRequest,
  RecommendationResponse,
  ScenarioRequest,
  ScenarioResponse,
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
  }),
});

export const { useGetQuoteMutation, useGetScenarioMutation, useGetRecommendationsMutation } =
  analyticsApi;
