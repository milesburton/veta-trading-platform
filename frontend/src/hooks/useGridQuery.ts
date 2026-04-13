/**
 * useGridQuery — server-driven grid data hook.
 *
 * Reads the current filterExpr, sortField and sortDir from Redux, posts a
 * GridQueryRequest to the gateway via RTK Query, and returns the paginated
 * server response.
 *
 * gatewayMiddleware calls dispatch(gridApi.util.invalidateTags(["Grid"])) on
 * live order events to trigger a background refetch.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryGridQuery } from "../store/gridApi.ts";
import { useAppSelector } from "../store/hooks.ts";
import { EMPTY_EXPR_GROUP } from "../types/gridPrefs.ts";
import type { GridId, GridQueryRequest, GridQueryResponse } from "../types/gridQuery.ts";

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

  const { data, isLoading, isError, isFetching } = useQueryGridQuery(request);

  const rows = (data as GridQueryResponse<T> | undefined)?.rows ?? EMPTY_ROWS;
  const total = data?.total ?? 0;
  const evalMs = data?.evalMs ?? 0;

  return useMemo(
    () => ({ rows, total, evalMs, isLoading, isError, isFetching }),
    [rows, total, evalMs, isLoading, isError, isFetching]
  );
}

const EMPTY_ROWS: never[] = [];
