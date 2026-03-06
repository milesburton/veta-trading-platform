export type FilterOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "between" | "in";

export interface FilterCriteria {
  id: string;
  field: string;
  op: FilterOp;
  value: string | number | [number, number] | string[];
}

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
  /** Required when scope = "cell" */
  field?: string;
  op: FilterOp;
  value: string | number | [number, number] | string[];
  style: CfStyle;
  /** User-friendly label shown in the rule editor */
  label?: string;
}

export interface GridPrefs {
  sortField: string | null;
  sortDir: "asc" | "desc" | null;
  filters: FilterCriteria[];
  cfRules: ConditionalFormatRule[];
}

export interface AllGridPrefs {
  orderBlotter?: GridPrefs;
  executions?: GridPrefs;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "enum";
  options?: string[];
}

export const EMPTY_GRID_PREFS: GridPrefs = {
  sortField: null,
  sortDir: null,
  filters: [],
  cfRules: [],
};
