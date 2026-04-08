import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { AuthUser, TradingLimits } from "./authSlice.ts";

export interface OAuthAuthorizeRequest {
  client_id: string;
  username: string;
  password: string;
  redirect_uri: string;
  response_type: "code";
  scope: string;
  code_challenge: string;
  code_challenge_method: "S256";
}

export interface OAuthAuthorizeResponse {
  code: string;
  redirect_uri: string;
  expires_in: number;
  scope: string;
  token_type: "none";
}

export interface OAuthTokenRequest {
  client_id: string;
  code: string;
  grant_type: "authorization_code";
  redirect_uri: string;
  code_verifier: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  scope: string;
  user: AuthUser;
}

export interface OAuthRegisterRequest {
  username: string;
  name: string;
  password: string;
}

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
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_USER_SERVICE_URL ?? "/api/user-service",
    credentials: "include",
  }),
  tagTypes: ["UserLimits"],
  endpoints: (builder) => ({
    authorizeOAuth: builder.mutation<OAuthAuthorizeResponse, OAuthAuthorizeRequest>({
      query: (body) => ({
        url: "/oauth/authorize",
        method: "POST",
        body,
      }),
    }),
    exchangeOAuthCode: builder.mutation<OAuthTokenResponse, OAuthTokenRequest>({
      query: (body) => ({
        url: "/oauth/token",
        method: "POST",
        body,
      }),
    }),
    registerOAuthUser: builder.mutation<
      { userId: string; name: string; role: string },
      OAuthRegisterRequest
    >({
      query: (body) => ({
        url: "/oauth/register",
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
    getDemoPersonas: builder.query<{ personas: DemoPersona[] }, void>({
      query: () => "/personas",
    }),
  }),
});

export interface DemoPersona {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
  description: string;
  trading_style: string | null;
  primary_desk: string | null;
  allowed_strategies: string[];
  max_order_qty: number;
  dark_pool_access: boolean;
}

export const {
  useAuthorizeOAuthMutation,
  useExchangeOAuthCodeMutation,
  useRegisterOAuthUserMutation,
  useDeleteSessionMutation,
  useGetUsersQuery,
  useGetUserLimitsQuery,
  useUpdateUserLimitsMutation,
  useGetDemoPersonasQuery,
} = userApi;
