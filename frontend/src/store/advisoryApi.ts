import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { AdvisoryNoteData } from "./advisorySlice.ts";
import type { LlmSubsystemStatus, LlmTriggerMode } from "./llmSubsystemSlice.ts";

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

interface UpdateLlmStateBody {
  enabled?: boolean;
  workerEnabled?: boolean;
  triggerMode?: LlmTriggerMode;
}

interface UpdateLlmStateResponse {
  status: string;
  runtimeConfig: {
    enabled: boolean;
    workerEnabled: boolean;
    triggerMode: LlmTriggerMode;
    updatedAt: number;
    updatedBy: string;
  };
}

interface WatchlistBriefBody {
  symbols?: string[];
}

interface WatchlistBriefResponse {
  status: string;
  jobIds: string[];
  count: number;
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
    getLlmSubsystemState: builder.query<LlmSubsystemStatus, void>({
      query: () => "/advisory/admin/state",
    }),
    updateLlmSubsystemState: builder.mutation<UpdateLlmStateResponse, UpdateLlmStateBody>({
      query: (body) => ({
        url: "/advisory/admin/state",
        method: "PUT",
        body,
      }),
    }),
    requestWatchlistBrief: builder.mutation<WatchlistBriefResponse, WatchlistBriefBody>({
      query: (body) => ({
        url: "/advisory/admin/watchlist-brief",
        method: "POST",
        body,
      }),
    }),
    triggerWorker: builder.mutation<{ status: string; output?: string }, void>({
      query: () => ({
        url: "/advisory/admin/trigger-worker",
        method: "POST",
      }),
    }),
  }),
});

export const {
  useGetAdvisoryQuery,
  useRequestAdvisoryMutation,
  useGetLlmSubsystemStateQuery,
  useUpdateLlmSubsystemStateMutation,
  useRequestWatchlistBriefMutation,
  useTriggerWorkerMutation,
} = advisoryApi;
