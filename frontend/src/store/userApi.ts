import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { AuthUser, TradingLimits } from "./authSlice.ts";

export interface UserRow {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
}

export interface UserLimits extends TradingLimits {
  userId: string;
}

export interface UpdateLimitsRequest {
  userId: string;
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

export const userApi = createApi({
  reducerPath: "userApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/user-service", credentials: "include" }),
  tagTypes: ["UserLimits"],
  endpoints: (builder) => ({
    createSession: builder.mutation<AuthUser, { userId: string }>({
      query: (body) => ({
        url: "/sessions",
        method: "POST",
        body,
      }),
    }),
    deleteSession: builder.mutation<void, void>({
      query: () => ({
        url: "/sessions",
        method: "DELETE",
      }),
    }),
    getUsers: builder.query<UserRow[], void>({
      query: () => "/users",
    }),
    getUserLimits: builder.query<UserLimits, string>({
      query: (userId) => `/users/${encodeURIComponent(userId)}/limits`,
      providesTags: (_result, _error, userId) => [{ type: "UserLimits", id: userId }],
    }),
    updateUserLimits: builder.mutation<UserLimits, UpdateLimitsRequest>({
      query: ({ userId, ...body }) => ({
        url: `/users/${encodeURIComponent(userId)}/limits`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { userId }) => [{ type: "UserLimits", id: userId }],
    }),
  }),
});

export const {
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useGetUsersQuery,
  useGetUserLimitsQuery,
  useUpdateUserLimitsMutation,
} = userApi;
