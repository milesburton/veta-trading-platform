import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { DataSource, OverridesResponse } from "../types/marketData.ts";

export const marketDataApi = createApi({
  reducerPath: "marketDataApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/gateway", credentials: "include" }),
  tagTypes: ["Overrides"],
  endpoints: (builder) => ({
    getSources: builder.query<DataSource[], void>({
      query: () => "/market-data/sources",
    }),
    getOverrides: builder.query<OverridesResponse, void>({
      query: () => "/market-data/overrides",
      providesTags: ["Overrides"],
    }),
    setOverrides: builder.mutation<OverridesResponse, Record<string, string>>({
      query: (overrides) => ({
        url: "/market-data/overrides",
        method: "PUT",
        body: { overrides },
      }),
      invalidatesTags: ["Overrides"],
    }),
  }),
});

export const { useGetSourcesQuery, useGetOverridesQuery, useSetOverridesMutation } = marketDataApi;
