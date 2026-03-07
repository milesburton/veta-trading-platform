import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { AdvisoryNoteData } from "./advisorySlice.ts";

interface NoAdvisoryResponse {
  status: "no-advisory";
  symbol: string;
}

interface AdvisoryResponse extends AdvisoryNoteData {
  hasPendingJob: boolean;
}

interface RequestAdvisoryBody {
  symbol: string;
  requestedBy?: string;
}

interface RequestAdvisoryResponse {
  status: "queued" | "deduplicated";
  jobId: string | null;
  existingJobId?: string | null;
  message?: string;
}

export const advisoryApi = createApi({
  reducerPath: "advisoryApi",
  baseQuery: fetchBaseQuery({
    baseUrl:
      (import.meta as { env: Record<string, string> }).env.VITE_GATEWAY_URL ?? "/api/gateway",
    credentials: "include",
  }),
  endpoints: (builder) => ({
    getAdvisory: builder.query<AdvisoryResponse | NoAdvisoryResponse, string>({
      query: (symbol) => `/advisory/${encodeURIComponent(symbol)}`,
    }),
    requestAdvisory: builder.mutation<RequestAdvisoryResponse, RequestAdvisoryBody>({
      query: (body) => ({
        url: "/advisory/request",
        method: "POST",
        body,
      }),
    }),
  }),
});

export const { useGetAdvisoryQuery, useRequestAdvisoryMutation } = advisoryApi;
