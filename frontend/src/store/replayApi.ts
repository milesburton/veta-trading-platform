import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface ReplaySession {
  id: string;
  userId: string;
  userName: string | null;
  userRole: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}

export interface ReplayConfig {
  recordingEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export const replayApi = createApi({
  reducerPath: "replayApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/replay" }),
  tagTypes: ["Sessions", "Config"],
  endpoints: (builder) => ({
    getReplayConfig: builder.query<ReplayConfig, void>({
      query: () => "/config",
      providesTags: ["Config"],
    }),
    updateReplayConfig: builder.mutation<
      { recordingEnabled: boolean },
      { enabled: boolean; userId?: string }
    >({
      query: (body) => ({ url: "/config", method: "PUT", body }),
      invalidatesTags: ["Config"],
    }),
    listSessions: builder.query<
      { sessions: ReplaySession[]; total: number },
      { limit?: number; offset?: number } | undefined
    >({
      query: (args) => ({
        url: "/sessions",
        params: args ? { limit: args.limit, offset: args.offset } : {},
      }),
      providesTags: ["Sessions"],
    }),
    createSession: builder.mutation<
      { id: string },
      {
        id: string;
        userId: string;
        userName?: string;
        userRole?: string;
        metadata?: Record<string, unknown>;
      }
    >({
      query: (body) => ({ url: "/sessions", method: "POST", body }),
      invalidatesTags: ["Sessions"],
    }),
    endSession: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/sessions/${id}/end`, method: "PUT" }),
      invalidatesTags: ["Sessions"],
    }),
    uploadChunk: builder.mutation<
      { ok: boolean },
      { sessionId: string; seq: number; events: unknown[] }
    >({
      query: ({ sessionId, ...body }) => ({
        url: `/sessions/${sessionId}/chunks`,
        method: "POST",
        body,
      }),
    }),
    getSessionEvents: builder.query<{ events: unknown[] }, string>({
      query: (id) => `/sessions/${id}/events`,
    }),
    deleteSession: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/sessions/${id}`, method: "DELETE" }),
      invalidatesTags: ["Sessions"],
    }),
  }),
});

export const {
  useGetReplayConfigQuery,
  useUpdateReplayConfigMutation,
  useListSessionsQuery,
  useCreateSessionMutation,
  useEndSessionMutation,
  useUploadChunkMutation,
  useGetSessionEventsQuery,
  useDeleteSessionMutation,
} = replayApi;
