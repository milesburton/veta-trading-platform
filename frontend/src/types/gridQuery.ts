/**
 * Grid query types — frontend copy of the contract defined in
 * backend/src/types/gridQuery.ts. Deliberately duplicated (not imported
 * cross-boundary) so frontend and backend can evolve independently.
 */

import type { ExprGroup } from "./gridPrefs.ts";

export type GridId = "orderBlotter" | "executions";

export interface GridQueryRequest {
  gridId: GridId;
  filterExpr: ExprGroup;
  sortField: string | null;
  sortDir: "asc" | "desc" | null;
  offset: number;
  limit: number;
}

export interface GridQueryResponse<T = Record<string, unknown>> {
  rows: T[];
  /** Total matching rows before slicing (for pagination display). */
  total: number;
  /** Server-side eval time in milliseconds (feeds observability). */
  evalMs: number;
}
