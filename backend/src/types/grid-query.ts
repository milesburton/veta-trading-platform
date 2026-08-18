/**
 * Grid query types — shared contract between gateway and journal.
 *
 * These mirror the frontend types in frontend/src/types/gridPrefs.ts and
 * frontend/src/types/gridQuery.ts. They are deliberately duplicated rather than
 * imported across the service boundary so each side can evolve independently.
 */

export type ExprJoin = "AND" | "OR";

export type ExprOp =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "contains"
  | "starts_with"
  | "ends_with"
  | "between"
  | "in"
  | "is_null"
  | "is_not_null";

export interface ExprRule {
  kind: "rule";
  id: string;
  field: string;
  op: ExprOp;
  value: string | number | [number, number] | string[];
}

export interface ExprGroup {
  kind: "group";
  id: string;
  join: ExprJoin;
  rules: ExprNode[];
}

export type ExprNode = ExprRule | ExprGroup;

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
