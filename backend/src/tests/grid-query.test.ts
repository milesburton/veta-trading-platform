import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { applyExprGroup, applySort, evalExprGroup, evalOp } from "../lib/grid-query.ts";
import type { ExprGroup } from "../types/grid-query.ts";

const rows = [
  {
    id: "1",
    asset: "AAPL",
    side: "BUY",
    quantity: 10_000,
    status: "filled",
    userId: "alice",
  },
  {
    id: "2",
    asset: "MSFT",
    side: "SELL",
    quantity: 50_000,
    status: "executing",
    userId: null,
  },
  {
    id: "3",
    asset: "GOOG",
    side: "BUY",
    quantity: 5000,
    status: "queued",
    userId: "bob",
  },
  {
    id: "4",
    asset: "TSLA",
    side: "SELL",
    quantity: 100_000,
    status: "expired",
    userId: "",
  },
];

test("[gridQuery/evalOp] = string match (case-insensitive)", () => {
  assert(evalOp("BUY", "=", "buy"));
  assert(!evalOp("BUY", "=", "SELL"));
});

test("[gridQuery/evalOp] = numeric match", () => {
  assert(evalOp(100, "=", 100));
  assert(!evalOp(100, "=", 200));
});

test("[gridQuery/evalOp] != string", () => {
  assert(evalOp("BUY", "!=", "SELL"));
  assert(!evalOp("BUY", "!=", "buy"));
});

test("[gridQuery/evalOp] > numeric", () => {
  assert(evalOp(200, ">", 100));
  assert(!evalOp(100, ">", 200));
});

test("[gridQuery/evalOp] < numeric", () => {
  assert(evalOp(50, "<", 100));
  assert(!evalOp(100, "<", 50));
});

test("[gridQuery/evalOp] >= numeric", () => {
  assert(evalOp(100, ">=", 100));
  assert(evalOp(101, ">=", 100));
  assert(!evalOp(99, ">=", 100));
});

test("[gridQuery/evalOp] <= numeric", () => {
  assert(evalOp(100, "<=", 100));
  assert(evalOp(99, "<=", 100));
  assert(!evalOp(101, "<=", 100));
});

test("[gridQuery/evalOp] contains (case-insensitive)", () => {
  assert(evalOp("AAPL INC", "contains", "aapl"));
  assert(!evalOp("MSFT", "contains", "aapl"));
});

test("[gridQuery/evalOp] starts_with", () => {
  assert(evalOp("AAPL", "starts_with", "AA"));
  assert(!evalOp("AAPL", "starts_with", "PL"));
});

test("[gridQuery/evalOp] ends_with", () => {
  assert(evalOp("AAPL", "ends_with", "PL"));
  assert(!evalOp("AAPL", "ends_with", "AA"));
});

test("[gridQuery/evalOp] between inclusive", () => {
  assert(evalOp(50, "between", [10, 100]));
  assert(evalOp(10, "between", [10, 100]));
  assert(evalOp(100, "between", [10, 100]));
  assert(!evalOp(101, "between", [10, 100]));
});

test("[gridQuery/evalOp] in array (case-insensitive)", () => {
  assert(evalOp("filled", "in", ["filled", "executing"]));
  assert(evalOp("FILLED", "in", ["filled"]));
  assert(!evalOp("queued", "in", ["filled", "executing"]));
});

test("[gridQuery/evalOp] is_null, null, undefined, empty string", () => {
  assert(evalOp(null, "is_null", ""));
  assert(evalOp(undefined, "is_null", ""));
  assert(evalOp("", "is_null", ""));
  assert(!evalOp("alice", "is_null", ""));
  assert(!evalOp(0, "is_null", ""));
});

test("[gridQuery/evalOp] is_not_null", () => {
  assert(evalOp("alice", "is_not_null", ""));
  assert(evalOp(0, "is_not_null", ""));
  assert(!evalOp(null, "is_not_null", ""));
  assert(!evalOp("", "is_not_null", ""));
});

test("[gridQuery/evalExprGroup] empty group passes every row", () => {
  const g: ExprGroup = { kind: "group", id: "root", join: "AND", rules: [] };
  for (const row of rows) {
    assert(evalExprGroup(row, g), `row ${row.id} should pass empty group`);
  }
});

test("[gridQuery/evalExprGroup] AND group, all rules must match", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "AND",
    rules: [
      { kind: "rule", id: "r1", field: "side", op: "=", value: "BUY" },
      { kind: "rule", id: "r2", field: "quantity", op: ">", value: 5000 },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(
    result.map((r) => r.id),
    ["1"]
  ); // AAPL BUY 10000
});

test("[gridQuery/evalExprGroup] OR group, any rule matches", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "OR",
    rules: [
      { kind: "rule", id: "r1", field: "status", op: "=", value: "filled" },
      { kind: "rule", id: "r2", field: "status", op: "=", value: "expired" },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(result.map((r) => r.id).sort(), ["1", "4"]);
});

test("[gridQuery/evalExprGroup] nested AND containing OR sub-group", () => {
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
          {
            kind: "rule",
            id: "r3",
            field: "status",
            op: "=",
            value: "expired",
          },
        ],
      },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(result.map((r) => r.id).sort(), ["1", "4"]);
});

test("[gridQuery/evalExprGroup] nested OR containing AND sub-group", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "OR",
    rules: [
      { kind: "rule", id: "r1", field: "asset", op: "=", value: "GOOG" },
      {
        kind: "group",
        id: "sub",
        join: "AND",
        rules: [
          { kind: "rule", id: "r2", field: "side", op: "=", value: "SELL" },
          {
            kind: "rule",
            id: "r3",
            field: "quantity",
            op: ">=",
            value: 100_000,
          },
        ],
      },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(result.map((r) => r.id).sort(), ["3", "4"]);
});

test("[gridQuery/evalExprGroup] is_null on null and empty-string userId", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "AND",
    rules: [
      {
        kind: "rule",
        id: "r1",
        field: "userId",
        op: "is_null",
        value: "",
      },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(result.map((r) => r.id).sort(), ["2", "4"]);
});

test("[gridQuery/evalExprGroup] is_not_null on userId", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "AND",
    rules: [
      {
        kind: "rule",
        id: "r1",
        field: "userId",
        op: "is_not_null",
        value: "",
      },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(result.map((r) => r.id).sort(), ["1", "3"]);
});

test("[gridQuery/evalExprGroup] between on quantity", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "AND",
    rules: [
      {
        kind: "rule",
        id: "r1",
        field: "quantity",
        op: "between",
        value: [5000, 50_000],
      },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(result.map((r) => r.id).sort(), ["1", "2", "3"]);
});

test("[gridQuery/evalExprGroup] starts_with on asset", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "AND",
    rules: [
      {
        kind: "rule",
        id: "r1",
        field: "asset",
        op: "starts_with",
        value: "A",
      },
    ],
  };
  const result = applyExprGroup(rows, g);
  assertEquals(
    result.map((r) => r.id),
    ["1"]
  ); // AAPL
});

test("[gridQuery/applySort] ascending by quantity", () => {
  const sorted = applySort([...rows], "quantity", "asc");
  assertEquals(
    sorted.map((r) => r.id),
    ["3", "1", "2", "4"]
  );
});

test("[gridQuery/applySort] descending by quantity", () => {
  const sorted = applySort([...rows], "quantity", "desc");
  assertEquals(
    sorted.map((r) => r.id),
    ["4", "2", "1", "3"]
  );
});

test("[gridQuery/applySort] ascending by string field (asset)", () => {
  const sorted = applySort([...rows], "asset", "asc");
  assertEquals(
    sorted.map((r) => r.asset),
    ["AAPL", "GOOG", "MSFT", "TSLA"]
  );
});

test("[gridQuery/applySort] null field returns input unchanged", () => {
  const original = [...rows];
  const sorted = applySort(original, null, "asc");
  assertEquals(sorted, original);
});

test("[gridQuery/applySort] null dir returns input unchanged", () => {
  const original = [...rows];
  const sorted = applySort(original, "quantity", null);
  assertEquals(sorted, original);
});

test("[gridQuery/applySort] does not mutate input array", () => {
  const original = [...rows];
  applySort(original, "quantity", "asc");
  assertEquals(original[0].id, "1"); // input order unchanged
});

test("[gridQuery/applyExprGroup] empty group returns all rows", () => {
  const g: ExprGroup = { kind: "group", id: "root", join: "AND", rules: [] };
  const result = applyExprGroup([...rows], g);
  assertEquals(result.length, rows.length);
});

test("[gridQuery/applyExprGroup] no match returns empty array", () => {
  const g: ExprGroup = {
    kind: "group",
    id: "root",
    join: "AND",
    rules: [{ kind: "rule", id: "r1", field: "asset", op: "=", value: "NVDA" }],
  };
  const result = applyExprGroup([...rows], g);
  assertEquals(result.length, 0);
});
