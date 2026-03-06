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
import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import { EMPTY_EXPR_GROUP } from "../types/gridPrefs.ts";
import type { GridId, GridQueryRequest, GridQueryResponse } from "../types/gridQuery.ts";

const GATEWAY_URL = typeof window !== "undefined" ? `${window.location.origin}/api/gateway` : "";

const ROW_HEIGHT_PX = 30;
const BUFFER_FACTOR = 1.2;
const MIN_LIMIT = 20;

export interface UseGridQueryResult<T> {
  rows: T[];
  total: number;
  evalMs: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
}

/**
 * Returns a ref to attach to the scroll container and a limit derived from
 * the container's current height — visible rows × BUFFER_FACTOR.
 */
export function useContainerLimit(): {
  containerRef: React.RefObject<HTMLDivElement>;
  limit: number;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(MIN_LIMIT);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      setLimit(Math.max(MIN_LIMIT, Math.ceil((height / ROW_HEIGHT_PX) * BUFFER_FACTOR)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { containerRef, limit };
}

export function useGridQuery<T = Record<string, unknown>>(
  gridId: GridId,
  offset = 0,
  limit = MIN_LIMIT
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
