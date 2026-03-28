/**
 * Server-side grid query engine.
 *
 * Ports the frontend applyExprGroup / applySort logic so that filter + sort
 * evaluation runs in the journal service rather than the browser. This is the
 * single canonical evaluator for the backend; the frontend copy in
 * frontend/src/utils/gridFilter.ts is kept for CF rule evaluation and tests.
 *
 * All 13 ExprOp operators are supported, matching the frontend exactly.
 */

import type { ExprGroup, ExprNode, ExprOp, ExprRule } from "../types/gridQuery.ts";

function getField(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

export function evalOp(
  rowVal: unknown,
  op: ExprOp,
  filterVal: ExprRule["value"],
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

function evalExprRule(row: Record<string, unknown>, rule: ExprRule): boolean {
  return evalOp(getField(row, rule.field), rule.op, rule.value);
}

function evalExprNode(row: Record<string, unknown>, node: ExprNode): boolean {
  if (node.kind === "rule") return evalExprRule(row, node);
  return evalExprGroup(row, node);
}

/**
 * Recursively evaluate an ExprGroup against a single row.
 * AND: all nodes must match. OR: at least one must match.
 * An empty group always passes (no filter active).
 */
export function evalExprGroup(row: Record<string, unknown>, group: ExprGroup): boolean {
  if (group.rules.length === 0) return true;
  if (group.join === "AND") return group.rules.every((n) => evalExprNode(row, n));
  return group.rules.some((n) => evalExprNode(row, n));
}

/**
 * Filter rows by an expression group tree.
 */
export function applyExprGroup(
  rows: Record<string, unknown>[],
  group: ExprGroup,
): Record<string, unknown>[] {
  if (group.rules.length === 0) return rows;
  return rows.filter((row) => evalExprGroup(row, group));
}

/**
 * Sort rows by a single field. Returns input unchanged if field or dir is null.
 * Numeric fields are compared numerically; others use localeCompare.
 */
export function applySort(
  rows: Record<string, unknown>[],
  field: string | null,
  dir: "asc" | "desc" | null,
): Record<string, unknown>[] {
  if (!field || !dir) return rows;
  return [...rows].sort((a, b) => {
    const av = getField(a, field);
    const bv = getField(b, field);
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
