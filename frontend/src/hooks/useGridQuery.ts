/**
 * useGridQuery — server-driven grid data hook.
 *
 * Reads the current filterExpr, sortField and sortDir from Redux, posts a
 * GridQueryRequest to the gateway, and returns the paginated server response.
 *
 * TanStack Query handles caching, background refetch, and stale-while-revalidate.
 * The queryClient.invalidateQueries(["grid"]) call in gatewayMiddleware triggers
 * a background refetch whenever a live order event arrives over the WebSocket.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAppSelector } from "../store/hooks.ts";
import { EMPTY_EXPR_GROUP } from "../types/gridPrefs.ts";
import type { GridId, GridQueryRequest, GridQueryResponse } from "../types/gridQuery.ts";

const GATEWAY_URL = typeof window !== "undefined" ? `${window.location.origin}/api/gateway` : "";

const DEFAULT_LIMIT = 200;

export interface UseGridQueryResult<T> {
  rows: T[];
  total: number;
  evalMs: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
}

export function useGridQuery<T = Record<string, unknown>>(
  gridId: GridId,
  offset = 0,
  limit = DEFAULT_LIMIT
): UseGridQueryResult<T> {
  const { filterExpr, sortField, sortDir } = useAppSelector((s) => s.gridPrefs[gridId]);

  const request: GridQueryRequest = {
    gridId,
    filterExpr: filterExpr ?? EMPTY_EXPR_GROUP,
    sortField: sortField ?? null,
    sortDir: sortDir ?? null,
    offset,
    limit,
  };

  const { data, isLoading, isError, isFetching } = useQuery<GridQueryResponse<T>>({
    queryKey: ["grid", gridId, request],
    queryFn: async () => {
      const res = await fetch(`${GATEWAY_URL}/grid/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`Grid query failed: ${res.status} ${text}`);
      }
      return res.json() as Promise<GridQueryResponse<T>>;
    },
    staleTime: 2_000,
    placeholderData: keepPreviousData,
  });

  return {
    rows: data?.rows ?? [],
    total: data?.total ?? 0,
    evalMs: data?.evalMs ?? 0,
    isLoading,
    isError,
    isFetching,
  };
}
