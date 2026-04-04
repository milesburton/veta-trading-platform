export type FilterOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "between" | "in";

export interface FilterCriteria {
  id: string;
  field: string;
  op: FilterOp;
  value: string | number | [number, number] | string[];
}

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

export type CfScope = "row" | "cell";

export interface CfStyle {
  bg?: string;
  textColor?: string;
  bold?: boolean;
  border?: string;
}

export interface ConditionalFormatRule {
  id: string;
  scope: CfScope;
  cellField?: string;
  expr: ExprGroup;
  style: CfStyle;
  label?: string;
}

export interface ColDef {
  key: string;
  label: string;
  type: "string" | "number" | "enum";
  options?: string[];
  defaultWidth: number;
  minWidth?: number;
  align?: "left" | "right";
}

export interface FieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "enum";
  options?: string[];
}

export interface GridPrefs {
  sortField: string | null;
  sortDir: "asc" | "desc" | null;
  filters: FilterCriteria[];
  filterExpr: ExprGroup;
  cfRules: ConditionalFormatRule[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
}

export interface AllGridPrefs {
  orderBlotter?: GridPrefs;
  executions?: GridPrefs;
  algoMonitor?: GridPrefs;
  childOrders?: GridPrefs;
  marketMatch?: GridPrefs;
  marketLadder?: GridPrefs;
}

export const EMPTY_EXPR_GROUP: ExprGroup = {
  kind: "group",
  id: "root",
  join: "AND",
  rules: [],
};

export const EMPTY_GRID_PREFS: GridPrefs = {
  sortField: null,
  sortDir: null,
  filters: [],
  filterExpr: EMPTY_EXPR_GROUP,
  cfRules: [],
  columnWidths: {},
  columnOrder: [],
};
