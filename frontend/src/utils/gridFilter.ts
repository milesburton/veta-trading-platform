import type { CfStyle, ConditionalFormatRule, FilterCriteria } from "../types/gridPrefs.ts";

// ── Field value accessor ───────────────────────────────────────────────────────

function getField(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

// ── Operator evaluation ────────────────────────────────────────────────────────

function evalOp(
  rowVal: unknown,
  op: FilterCriteria["op"],
  filterVal: FilterCriteria["value"]
): boolean {
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

  // Numeric-aware comparisons
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

// ── Public API ─────────────────────────────────────────────────────────────────

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

// ── Conditional formatting ─────────────────────────────────────────────────────

function cfStyleToClasses(style: CfStyle): string {
  const parts: string[] = [];
  if (style.bg) parts.push(style.bg);
  if (style.textColor) parts.push(style.textColor);
  if (style.bold) parts.push("font-bold");
  if (style.border) parts.push(style.border);
  return parts.join(" ");
}

/**
 * Evaluate conditional format rules against a single row.
 *
 * Row-scoped rules: first matching rule wins (applies to the entire row).
 * Cell-scoped rules: all matching rules for a given field are merged (later wins).
 *
 * Returns Tailwind class strings ready to spread into className props.
 */
export function applyCfRules<T>(
  row: T,
  rules: ConditionalFormatRule[]
): { rowClasses: string; cellClasses: Record<string, string> } {
  const rowRecord = row as Record<string, unknown>;
  let rowClasses = "";
  const cellClasses: Record<string, string> = {};

  for (const rule of rules) {
    const fieldVal = rule.field ? getField(rowRecord, rule.field) : undefined;
    const testVal = rule.scope === "cell" ? fieldVal : getField(rowRecord, rule.field ?? "");

    if (rule.scope === "row") {
      if (
        !rowClasses &&
        rule.field &&
        evalOp(getField(rowRecord, rule.field), rule.op, rule.value)
      ) {
        rowClasses = cfStyleToClasses(rule.style);
      }
    } else {
      // cell scope — field is required
      if (rule.field && evalOp(testVal, rule.op, rule.value)) {
        const existing = cellClasses[rule.field] ?? "";
        cellClasses[rule.field] = `${existing} ${cfStyleToClasses(rule.style)}`.trim();
      }
    }
  }

  return { rowClasses, cellClasses };
}
