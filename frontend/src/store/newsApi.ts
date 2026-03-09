import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { NewsItem } from "./newsSlice.ts";

const NEWS_AGGREGATOR_BASE =
  (import.meta.env?.VITE_NEWS_AGGREGATOR_URL as string | undefined) ?? "/api/news-aggregator";

export interface NewsSource {
  id: string;
  label: string;
  enabled: boolean;
  symbolSpecific: boolean;
}

export const newsApi = createApi({
  reducerPath: "newsApi",
  baseQuery: fetchBaseQuery({ baseUrl: NEWS_AGGREGATOR_BASE }),
  tagTypes: ["NewsSources"],
  endpoints: (builder) => ({
    getNewsBySymbol: builder.query<NewsItem[], { symbol: string; limit?: number }>({
      query: ({ symbol, limit = 50 }) =>
        `/news?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
    }),
    getNewsSources: builder.query<NewsSource[], void>({
      query: () => "/sources",
      providesTags: ["NewsSources"],
    }),
    toggleNewsSource: builder.mutation<NewsSource, string>({
      query: (id) => ({
        url: `/sources/${encodeURIComponent(id)}/toggle`,
        method: "POST",
      }),
      invalidatesTags: ["NewsSources"],
    }),
  }),
});

export const { useGetNewsBySymbolQuery, useGetNewsSourcesQuery, useToggleNewsSourceMutation } =
  newsApi;
