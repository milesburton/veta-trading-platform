import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { QuickTradeIntent } from "@veta/frontend/domain/quickTrade/parse.ts";

interface ParseTicketRequest {
  input: string;
  symbols?: string[];
}

type ParseTicketResponse = { intent: QuickTradeIntent } | { error: string };

export const parseTicketApi = createApi({
  reducerPath: "parseTicketApi",
  baseQuery: fetchBaseQuery({
    baseUrl:
      (import.meta as { env: Record<string, string> }).env.VITE_GATEWAY_URL ?? "/api/gateway",
    credentials: "include",
  }),
  endpoints: (builder) => ({
    getFeatures: builder.query<{ quickTradeAi: boolean }, void>({
      query: () => "/features",
    }),
    parseTicket: builder.mutation<ParseTicketResponse, ParseTicketRequest>({
      query: (body) => ({
        url: "/api/llm-advisory/parse-ticket",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const { useGetFeaturesQuery, useParseTicketMutation } = parseTicketApi;
