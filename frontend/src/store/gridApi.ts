import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { GridQueryRequest, GridQueryResponse } from "../types/gridQuery.ts";

export const gridApi = createApi({
  reducerPath: "gridApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/gateway", credentials: "include" }),
  tagTypes: ["Grid"],
  endpoints: (builder) => ({
    queryGrid: builder.query<GridQueryResponse, GridQueryRequest>({
      query: (body) => ({
        url: "/grid/query",
        method: "POST",
        body,
      }),
      providesTags: (_result, _error, req) => [{ type: "Grid", id: req.gridId }, "Grid"],
    }),
  }),
});

export const { useQueryGridQuery } = gridApi;
