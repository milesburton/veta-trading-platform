import type {
  CfStyle,
  ConditionalFormatRule,
  ExprGroup,
  ExprNode,
  ExprOp,
  ExprRule,
  FieldDef,
  FilterCriteria,
} from "../types/gridPrefs.ts";

function getField(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

function evalOp(
  rowVal: unknown,
  op: FilterCriteria["op"] | ExprOp,
  filterVal: FilterCriteria["value"]
): boolean {
  if (op === "is_null") return rowVal === null || rowVal === undefined || rowVal === "";
  if (op === "is_not_null") return rowVal !== null && rowVal !== undefined && rowVal !== "";

  if (op === "between") {
    const [lo, hi] = filterVal as [number, number];
    const n = Number(rowVal);
    return !Number.isNaN(n) && n >= lo && n <= hi;
  }

  if (op === "in") {
    const arr = filterVal as string[];
    return arr.map((v) => v.toLowerCase()).includes(String(rowVal).toLowerCase());
  }

  if (op === "contains") {
    return String(rowVal).toLowerCase().includes(String(filterVal).toLowerCase());
  }

  if (op === "starts_with") {
    return String(rowVal).toLowerCase().startsWith(String(filterVal).toLowerCase());
  }

  if (op === "ends_with") {
    return String(rowVal).toLowerCase().endsWith(String(filterVal).toLowerCase());
  }

  const rv = Number(rowVal);
  const fv = Number(filterVal);
  const numericOk = !Number.isNaN(rv) && !Number.isNaN(fv);

  switch (op) {
    case "=":
      return numericOk
        ? rv === fv
        : String(rowVal).toLowerCase() === String(filterVal).toLowerCase();
    case "!=":
      return numericOk
        ? rv !== fv
        : String(rowVal).toLowerCase() !== String(filterVal).toLowerCase();
    case ">":
      return numericOk ? rv > fv : String(rowVal) > String(filterVal);
    case "<":
      return numericOk ? rv < fv : String(rowVal) < String(filterVal);
    case ">=":
      return numericOk ? rv >= fv : String(rowVal) >= String(filterVal);
    case "<=":
      return numericOk ? rv <= fv : String(rowVal) <= String(filterVal);
    default:
      return true;
  }
}

/**
 * Filter rows by an AND-joined list of criteria.
 * Rows not matching ALL criteria are excluded.
 */
export function applyFilters<T>(rows: T[], criteria: FilterCriteria[]): T[] {
  if (criteria.length === 0) return rows;
  return rows.filter((row) =>
    criteria.every((c) => evalOp(getField(row as Record<string, unknown>, c.field), c.op, c.value))
  );
}

/**
 * Sort rows by a single field.
 * null field or null dir returns the input array unchanged.
 */
export function applySort<T>(rows: T[], field: string | null, dir: "asc" | "desc" | null): T[] {
  if (!field || !dir) return rows;
  return [...rows].sort((a, b) => {
    const av = getField(a as Record<string, unknown>, field);
    const bv = getField(b as Record<string, unknown>, field);
    const an = Number(av);
    const bn = Number(bv);
    let cmp: number;
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      cmp = an - bn;
    } else {
      cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function evalExprRule<T>(row: T, rule: ExprRule): boolean {
  const val = getField(row as Record<string, unknown>, rule.field);
  return evalOp(val, rule.op, rule.value);
}

function evalExprNode<T>(row: T, node: ExprNode): boolean {
  if (node.kind === "rule") return evalExprRule(row, node);
  return evalExprGroup(row, node);
}

/**
 * Recursively evaluate an ExprGroup against a single row.
 * AND: all nodes must match. OR: at least one must match.
 * An empty group always passes.
 */
export function evalExprGroup<T>(row: T, group: ExprGroup): boolean {
  if (group.rules.length === 0) return true;
  if (group.join === "AND") return group.rules.every((n) => evalExprNode(row, n));
  return group.rules.some((n) => evalExprNode(row, n));
}

/**
 * Filter rows by an expression group tree.
 */
export function applyExprGroup<T>(rows: T[], group: ExprGroup): T[] {
  if (group.rules.length === 0) return rows;
  return rows.filter((row) => evalExprGroup(row, group));
}

const OP_DISPLAY: Record<ExprOp, string> = {
  "=": "=",
  "!=": "≠",
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
  contains: "~",
  starts_with: "^",
  ends_with: "$",
  between: "↔",
  in: "∈",
  is_null: "IS NULL",
  is_not_null: "IS NOT NULL",
};

function ruleToDisplay(rule: ExprRule, fields: FieldDef[]): string {
  const label = fields.find((f) => f.key === rule.field)?.label ?? rule.field;
  const opStr = OP_DISPLAY[rule.op] ?? rule.op;
  if (rule.op === "is_null" || rule.op === "is_not_null") return `${label} ${opStr}`;
  if (rule.op === "between") {
    const [lo, hi] = rule.value as [number, number];
    return `${label} ${lo}–${hi}`;
  }
  if (rule.op === "in") {
    const arr = rule.value as string[];
    return `${label} ∈ {${arr.join(", ")}}`;
  }
  return `${label} ${opStr} ${rule.value}`;
}

/**
 * Returns a compact human-readable summary of an ExprGroup for display in the filter bar.
 * E.g. "status IS NOT NULL AND qty > 50000"
 */
export function exprGroupToDisplay(group: ExprGroup, fields: FieldDef[]): string {
  if (group.rules.length === 0) return "";
  const parts = group.rules.map((node): string => {
    if (node.kind === "rule") return ruleToDisplay(node, fields);
    const inner = exprGroupToDisplay(node, fields);
    return group.rules.length > 1 ? `(${inner})` : inner;
  });
  return parts.join(` ${group.join} `);
}

function cfStyleToClasses(style: CfStyle): string {
  const parts: string[] = [];
  if (style.bg) parts.push(style.bg);
  if (style.textColor) parts.push(style.textColor);
  if (style.bold) parts.push("font-bold");
  if (style.border) parts.push(style.border);
  return parts.join(" ");
}

export function applyCfRules<T>(
  row: T,
  rules: ConditionalFormatRule[]
): { rowClasses: string; cellClasses: Record<string, string> } {
  let rowClasses = "";
  const cellClasses: Record<string, string> = {};

  for (const rule of rules) {
    if (!evalExprGroup(row, rule.expr)) continue;

    if (rule.scope === "row") {
      if (!rowClasses) rowClasses = cfStyleToClasses(rule.style);
    } else {
      const field = rule.cellField;
      if (field) {
        const existing = cellClasses[field] ?? "";
        cellClasses[field] = `${existing} ${cfStyleToClasses(rule.style)}`.trim();
      }
    }
  }

  return { rowClasses, cellClasses };
}
