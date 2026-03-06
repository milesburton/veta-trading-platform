import { describe, expect, it } from "vitest";
import type { ConditionalFormatRule, ExprGroup, FilterCriteria } from "../../types/gridPrefs.ts";
import {
  applyCfRules,
  applyExprGroup,
  applyFilters,
  applySort,
  evalExprGroup,
  exprGroupToDisplay,
} from "../gridFilter.ts";

// ── Test data ──────────────────────────────────────────────────────────────────

const rows = [
  { id: "1", asset: "AAPL", side: "BUY", quantity: 10000, status: "filled" },
  { id: "2", asset: "MSFT", side: "SELL", quantity: 50000, status: "executing" },
  { id: "3", asset: "GOOG", side: "BUY", quantity: 5000, status: "queued" },
  { id: "4", asset: "TSLA", side: "SELL", quantity: 100000, status: "expired" },
] as const;

type Row = (typeof rows)[number];

// ── applyFilters ───────────────────────────────────────────────────────────────

describe("applyFilters", () => {
  it("returns all rows when criteria is empty", () => {
    expect(applyFilters([...rows], [])).toHaveLength(4);
  });

  it("filters with = (string)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "side", op: "=", value: "BUY" }];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.side === "BUY")).toBe(true);
  });

  it("filters with = (case-insensitive)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "side", op: "=", value: "buy" }];
    expect(applyFilters([...rows], criteria)).toHaveLength(2);
  });

  it("filters with != (string)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "side", op: "!=", value: "BUY" }];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.side === "SELL")).toBe(true);
  });

  it("filters with > (number)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "quantity", op: ">", value: 10000 }];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["2", "4"]);
  });

  it("filters with < (number)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "quantity", op: "<", value: 10000 }];
    expect(applyFilters([...rows], criteria)).toHaveLength(1);
  });

  it("filters with >= (number)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "quantity", op: ">=", value: 10000 }];
    expect(applyFilters([...rows], criteria)).toHaveLength(3);
  });

  it("filters with <= (number)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "quantity", op: "<=", value: 10000 }];
    expect(applyFilters([...rows], criteria)).toHaveLength(2);
  });

  it("filters with contains (case-insensitive)", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "asset", op: "contains", value: "oo" }];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(1);
    expect(result[0].asset).toBe("GOOG");
  });

  it("filters with between", () => {
    const criteria: FilterCriteria[] = [
      { id: "1", field: "quantity", op: "between", value: [5000, 50000] },
    ];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(3); // 5000, 10000, 50000
  });

  it("filters with in (enum multi-select)", () => {
    const criteria: FilterCriteria[] = [
      { id: "1", field: "status", op: "in", value: ["filled", "executing"] },
    ];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(2);
  });

  it("ANDs multiple criteria together", () => {
    const criteria: FilterCriteria[] = [
      { id: "1", field: "side", op: "=", value: "BUY" },
      { id: "2", field: "quantity", op: ">", value: 6000 },
    ];
    const result = applyFilters([...rows], criteria);
    expect(result).toHaveLength(1);
    expect(result[0].asset).toBe("AAPL");
  });

  it("returns empty array when nothing matches", () => {
    const criteria: FilterCriteria[] = [{ id: "1", field: "asset", op: "=", value: "NVDA" }];
    expect(applyFilters([...rows], criteria)).toHaveLength(0);
  });
});

// ── applySort ──────────────────────────────────────────────────────────────────

describe("applySort", () => {
  it("returns rows unchanged when field is null", () => {
    const result = applySort([...rows] as Row[], null, "asc");
    expect(result.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("returns rows unchanged when dir is null", () => {
    const result = applySort([...rows] as Row[], "asset", null);
    expect(result.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("sorts strings ascending", () => {
    const result = applySort([...rows] as Row[], "asset", "asc");
    expect(result.map((r) => r.asset)).toEqual(["AAPL", "GOOG", "MSFT", "TSLA"]);
  });

  it("sorts strings descending", () => {
    const result = applySort([...rows] as Row[], "asset", "desc");
    expect(result.map((r) => r.asset)).toEqual(["TSLA", "MSFT", "GOOG", "AAPL"]);
  });

  it("sorts numbers ascending", () => {
    const result = applySort([...rows] as Row[], "quantity", "asc");
    expect(result.map((r) => r.quantity)).toEqual([5000, 10000, 50000, 100000]);
  });

  it("sorts numbers descending", () => {
    const result = applySort([...rows] as Row[], "quantity", "desc");
    expect(result.map((r) => r.quantity)).toEqual([100000, 50000, 10000, 5000]);
  });

  it("does not mutate the input array", () => {
    const input = [...rows] as Row[];
    applySort(input, "asset", "asc");
    expect(input.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });
});

// ── applyCfRules ───────────────────────────────────────────────────────────────

describe("applyCfRules", () => {
  it("returns empty classes when no rules", () => {
    const { rowClasses, cellClasses } = applyCfRules(rows[0] as Row, []);
    expect(rowClasses).toBe("");
    expect(cellClasses).toEqual({});
  });

  it("applies row-scoped rule when it matches", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "r1",
        scope: "row",
        field: "status",
        op: "=",
        value: "filled",
        style: { bg: "bg-emerald-900/40" },
      },
    ];
    const { rowClasses } = applyCfRules(rows[0] as Row, rules);
    expect(rowClasses).toContain("bg-emerald-900/40");
  });

  it("does not apply row-scoped rule when it does not match", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "r1",
        scope: "row",
        field: "status",
        op: "=",
        value: "filled",
        style: { bg: "bg-emerald-900/40" },
      },
    ];
    const { rowClasses } = applyCfRules(rows[1] as Row, rules);
    expect(rowClasses).toBe("");
  });

  it("first matching row-scoped rule wins", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "r1",
        scope: "row",
        field: "side",
        op: "=",
        value: "BUY",
        style: { bg: "bg-blue-900/40" },
      },
      {
        id: "r2",
        scope: "row",
        field: "status",
        op: "=",
        value: "filled",
        style: { bg: "bg-emerald-900/40" },
      },
    ];
    // row 0 matches both — first rule wins
    const { rowClasses } = applyCfRules(rows[0] as Row, rules);
    expect(rowClasses).toContain("bg-blue-900/40");
    expect(rowClasses).not.toContain("bg-emerald-900/40");
  });

  it("applies cell-scoped rule to correct field", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "c1",
        scope: "cell",
        field: "status",
        op: "=",
        value: "expired",
        style: { textColor: "text-gray-500" },
      },
    ];
    const { cellClasses } = applyCfRules(rows[3] as Row, rules);
    expect(cellClasses.status).toContain("text-gray-500");
  });

  it("does not apply cell rule to non-matching row", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "c1",
        scope: "cell",
        field: "status",
        op: "=",
        value: "expired",
        style: { textColor: "text-gray-500" },
      },
    ];
    const { cellClasses } = applyCfRules(rows[0] as Row, rules);
    expect(cellClasses.status).toBeUndefined();
  });

  it("merges multiple cell rules for the same field", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "c1",
        scope: "cell",
        field: "quantity",
        op: ">",
        value: 9000,
        style: { textColor: "text-amber-400" },
      },
      {
        id: "c2",
        scope: "cell",
        field: "quantity",
        op: ">",
        value: 9000,
        style: { bold: true },
      },
    ];
    const { cellClasses } = applyCfRules(rows[0] as Row, rules);
    expect(cellClasses.quantity).toContain("text-amber-400");
    expect(cellClasses.quantity).toContain("font-bold");
  });

  it("includes bold class when bold: true in style", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "r1",
        scope: "row",
        field: "side",
        op: "=",
        value: "BUY",
        style: { bold: true },
      },
    ];
    const { rowClasses } = applyCfRules(rows[0] as Row, rules);
    expect(rowClasses).toContain("font-bold");
  });

  it("includes border class in row styles", () => {
    const rules: ConditionalFormatRule[] = [
      {
        id: "r1",
        scope: "row",
        field: "quantity",
        op: ">",
        value: 90000,
        style: { border: "border-l-2 border-l-red-500" },
      },
    ];
    const { rowClasses } = applyCfRules(rows[3] as Row, rules);
    expect(rowClasses).toContain("border-l-2");
  });
});

// ── evalExprGroup / applyExprGroup ─────────────────────────────────────────────

const exprRows = [
  { id: "1", asset: "AAPL", side: "BUY", quantity: 10000, status: "filled", note: null },
  { id: "2", asset: "MSFT", side: "SELL", quantity: 50000, status: "executing", note: "large" },
  { id: "3", asset: "GOOG", side: "BUY", quantity: 5000, status: "queued", note: undefined },
  { id: "4", asset: "TSLA", side: "SELL", quantity: 100000, status: "expired", note: "" },
];

describe("evalExprGroup – AND group", () => {
  it("passes all rows when group is empty", () => {
    const g: ExprGroup = { kind: "group", id: "g1", join: "AND", rules: [] };
    expect(exprRows.every((r) => evalExprGroup(r, g))).toBe(true);
  });

  it("AND: all rules must match", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g1",
      join: "AND",
      rules: [
        { kind: "rule", id: "r1", field: "side", op: "=", value: "BUY" },
        { kind: "rule", id: "r2", field: "quantity", op: ">", value: 5000 },
      ],
    };
    const result = applyExprGroup(exprRows, g);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });
});

describe("evalExprGroup – OR group", () => {
  it("OR: at least one rule must match", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g1",
      join: "OR",
      rules: [
        { kind: "rule", id: "r1", field: "side", op: "=", value: "BUY" },
        { kind: "rule", id: "r2", field: "quantity", op: ">=", value: 100000 },
      ],
    };
    const result = applyExprGroup(exprRows, g);
    // BUY rows (1, 3) + TSLA qty=100000 (4)
    expect(result.map((r) => r.id).sort()).toEqual(["1", "3", "4"]);
  });
});

describe("evalExprGroup – nested groups", () => {
  it("AND group containing an OR sub-group", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "root",
      join: "AND",
      rules: [
        { kind: "rule", id: "r1", field: "quantity", op: ">", value: 5000 },
        {
          kind: "group",
          id: "sub",
          join: "OR",
          rules: [
            { kind: "rule", id: "r2", field: "side", op: "=", value: "BUY" },
            { kind: "rule", id: "r3", field: "status", op: "=", value: "expired" },
          ],
        },
      ],
    };
    // qty > 5000: rows 1(10k), 2(50k), 4(100k)
    // AND (side=BUY OR status=expired): row1(BUY✓), row2(SELL/executing✗), row4(SELL/expired✓)
    const result = applyExprGroup(exprRows, g);
    expect(result.map((r) => r.id).sort()).toEqual(["1", "4"]);
  });
});

describe("evalExprGroup – new operators", () => {
  it("is_null matches null/undefined/empty", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [{ kind: "rule", id: "r", field: "note", op: "is_null", value: "" }],
    };
    const result = applyExprGroup(exprRows, g);
    // null, undefined, "" all count as null → rows 1, 3, 4
    expect(result.map((r) => r.id).sort()).toEqual(["1", "3", "4"]);
  });

  it("is_not_null matches non-empty values", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [{ kind: "rule", id: "r", field: "note", op: "is_not_null", value: "" }],
    };
    const result = applyExprGroup(exprRows, g);
    expect(result).toHaveLength(1);
    expect(result[0].note).toBe("large");
  });

  it("starts_with", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [{ kind: "rule", id: "r", field: "asset", op: "starts_with", value: "MS" }],
    };
    expect(applyExprGroup(exprRows, g)).toHaveLength(1);
    expect(applyExprGroup(exprRows, g)[0].asset).toBe("MSFT");
  });

  it("ends_with", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [{ kind: "rule", id: "r", field: "asset", op: "ends_with", value: "OG" }],
    };
    expect(applyExprGroup(exprRows, g)[0].asset).toBe("GOOG");
  });
});

describe("exprGroupToDisplay", () => {
  const fields = [
    { key: "asset", label: "Asset", type: "string" as const },
    { key: "side", label: "Side", type: "enum" as const },
    { key: "quantity", label: "Qty", type: "number" as const },
    { key: "status", label: "Status", type: "enum" as const },
  ];

  it("returns empty string for empty group", () => {
    const g: ExprGroup = { kind: "group", id: "g", join: "AND", rules: [] };
    expect(exprGroupToDisplay(g, fields)).toBe("");
  });

  it("renders single rule", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [{ kind: "rule", id: "r", field: "side", op: "=", value: "BUY" }],
    };
    expect(exprGroupToDisplay(g, fields)).toBe("Side = BUY");
  });

  it("renders is_null without value", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [{ kind: "rule", id: "r", field: "status", op: "is_null", value: "" }],
    };
    expect(exprGroupToDisplay(g, fields)).toBe("Status IS NULL");
  });

  it("renders AND-joined rules", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "g",
      join: "AND",
      rules: [
        { kind: "rule", id: "r1", field: "side", op: "=", value: "BUY" },
        { kind: "rule", id: "r2", field: "quantity", op: ">", value: 50000 },
      ],
    };
    expect(exprGroupToDisplay(g, fields)).toBe("Side = BUY AND Qty > 50000");
  });

  it("wraps sub-groups in parentheses", () => {
    const g: ExprGroup = {
      kind: "group",
      id: "root",
      join: "AND",
      rules: [
        { kind: "rule", id: "r1", field: "quantity", op: ">", value: 5000 },
        {
          kind: "group",
          id: "sub",
          join: "OR",
          rules: [
            { kind: "rule", id: "r2", field: "side", op: "=", value: "BUY" },
            { kind: "rule", id: "r3", field: "status", op: "=", value: "expired" },
          ],
        },
      ],
    };
    expect(exprGroupToDisplay(g, fields)).toBe("Qty > 5000 AND (Side = BUY OR Status = expired)");
  });
});
