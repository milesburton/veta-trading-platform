import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { NewsItem } from "./newsSlice.ts";

const NEWS_AGGREGATOR_BASE =
  (import.meta.env?.VITE_NEWS_AGGREGATOR_URL as string | undefined) ?? "/api/news-aggregator";

export interface NewsSource {
  id: string;
  label: string;
  rssTemplate?: string;
  enabled: boolean;
  symbolSpecific: boolean;
}

export interface CreateNewsSourcePayload {
  label: string;
  rssTemplate: string;
  symbolSpecific: boolean;
  enabled: boolean;
}

export interface UpdateNewsSourcePayload {
  id: string;
  label?: string;
  rssTemplate?: string;
  symbolSpecific?: boolean;
  enabled?: boolean;
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
    createNewsSource: builder.mutation<NewsSource, CreateNewsSourcePayload>({
      query: (body) => ({
        url: "/sources",
        method: "POST",
        body,
      }),
      invalidatesTags: ["NewsSources"],
    }),
    updateNewsSource: builder.mutation<NewsSource, UpdateNewsSourcePayload>({
      query: ({ id, ...body }) => ({
        url: `/sources/${encodeURIComponent(id)}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["NewsSources"],
    }),
    deleteNewsSource: builder.mutation<void, string>({
      query: (id) => ({
        url: `/sources/${encodeURIComponent(id)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["NewsSources"],
    }),
  }),
});

export const {
  useGetNewsBySymbolQuery,
  useGetNewsSourcesQuery,
  useToggleNewsSourceMutation,
  useCreateNewsSourceMutation,
  useUpdateNewsSourceMutation,
  useDeleteNewsSourceMutation,
} = newsApi;
