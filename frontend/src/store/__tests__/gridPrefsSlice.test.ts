import { describe, expect, it } from "vitest";
import type { AllGridPrefs } from "../../types/gridPrefs.ts";
import {
  gridPrefsSlice,
  resetGrid,
  setAllPrefs,
  setCfRules,
  setFilters,
  setSort,
} from "../gridPrefsSlice.ts";

const { reducer } = gridPrefsSlice;

const initial = reducer(undefined, { type: "@@INIT" });

describe("gridPrefsSlice – setFilters", () => {
  it("sets filters for orderBlotter", () => {
    const filters = [
      {
        id: "f1",
        field: "side",
        op: "=" as const,
        value: "BUY",
      },
    ];
    const state = reducer(initial, setFilters({ gridId: "orderBlotter", filters }));
    expect(state.orderBlotter.filters).toHaveLength(1);
    expect(state.executions.filters).toHaveLength(0);
  });

  it("sets filters for executions independently", () => {
    const filters = [
      {
        id: "f2",
        field: "asset",
        op: "=" as const,
        value: "AAPL",
      },
    ];
    const state = reducer(initial, setFilters({ gridId: "executions", filters }));
    expect(state.executions.filters).toHaveLength(1);
    expect(state.orderBlotter.filters).toHaveLength(0);
  });

  it("replaces existing filters", () => {
    const step1 = reducer(
      initial,
      setFilters({
        gridId: "orderBlotter",
        filters: [{ id: "a", field: "side", op: "=", value: "BUY" }],
      })
    );
    const step2 = reducer(
      step1,
      setFilters({
        gridId: "orderBlotter",
        filters: [{ id: "b", field: "asset", op: "=", value: "AAPL" }],
      })
    );
    expect(step2.orderBlotter.filters).toHaveLength(1);
    expect(step2.orderBlotter.filters[0].id).toBe("b");
  });
});

describe("gridPrefsSlice – setSort", () => {
  it("sets sort field and direction", () => {
    const state = reducer(initial, setSort({ gridId: "orderBlotter", field: "asset", dir: "asc" }));
    expect(state.orderBlotter.sortField).toBe("asset");
    expect(state.orderBlotter.sortDir).toBe("asc");
  });

  it("clears sort with null", () => {
    const withSort = reducer(
      initial,
      setSort({ gridId: "orderBlotter", field: "asset", dir: "asc" })
    );
    const cleared = reducer(withSort, setSort({ gridId: "orderBlotter", field: null, dir: null }));
    expect(cleared.orderBlotter.sortField).toBeNull();
    expect(cleared.orderBlotter.sortDir).toBeNull();
  });

  it("does not affect the other grid", () => {
    const state = reducer(
      initial,
      setSort({ gridId: "executions", field: "strategy", dir: "desc" })
    );
    expect(state.orderBlotter.sortField).toBeNull();
  });
});

describe("gridPrefsSlice – setCfRules", () => {
  it("sets CF rules for orderBlotter", () => {
    const rules = [
      {
        id: "r1",
        scope: "row" as const,
        expr: {
          kind: "group" as const,
          id: "g1",
          join: "AND" as const,
          rules: [
            {
              kind: "rule" as const,
              id: "rr1",
              field: "status",
              op: "=" as const,
              value: "filled",
            },
          ],
        },
        style: { bg: "bg-emerald-900/40" },
      },
    ];
    const state = reducer(initial, setCfRules({ gridId: "orderBlotter", rules }));
    expect(state.orderBlotter.cfRules).toHaveLength(1);
    expect(state.executions.cfRules).toHaveLength(0);
  });
});

describe("gridPrefsSlice – resetGrid", () => {
  it("clears all prefs for the specified grid", () => {
    const withData = reducer(
      reducer(
        initial,
        setFilters({
          gridId: "orderBlotter",
          filters: [{ id: "x", field: "side", op: "=", value: "BUY" }],
        })
      ),
      setSort({ gridId: "orderBlotter", field: "asset", dir: "asc" })
    );
    const cleared = reducer(withData, resetGrid({ gridId: "orderBlotter" }));
    expect(cleared.orderBlotter.filters).toHaveLength(0);
    expect(cleared.orderBlotter.sortField).toBeNull();
    expect(cleared.orderBlotter.cfRules).toHaveLength(0);
  });

  it("does not affect the other grid", () => {
    const withData = reducer(
      initial,
      setFilters({
        gridId: "executions",
        filters: [{ id: "e", field: "side", op: "=", value: "SELL" }],
      })
    );
    const cleared = reducer(withData, resetGrid({ gridId: "orderBlotter" }));
    expect(cleared.executions.filters).toHaveLength(1);
  });
});

describe("gridPrefsSlice – setAllPrefs", () => {
  it("hydrates both grids from server prefs", () => {
    const prefs: AllGridPrefs = {
      orderBlotter: {
        sortField: "quantity",
        sortDir: "desc",
        filters: [{ id: "f1", field: "side", op: "=", value: "BUY" }],
        filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
        cfRules: [],
        columnWidths: {},
        columnOrder: [],
      },
      executions: {
        sortField: null,
        sortDir: null,
        filters: [],
        filterExpr: { kind: "group", id: "root", join: "AND", rules: [] },
        cfRules: [],
        columnWidths: {},
        columnOrder: [],
      },
    };
    const state = reducer(initial, setAllPrefs(prefs));
    expect(state.orderBlotter.sortField).toBe("quantity");
    expect(state.orderBlotter.filters).toHaveLength(1);
  });

  it("only hydrates the grids present in the payload", () => {
    const withData = reducer(
      initial,
      setSort({ gridId: "executions", field: "strategy", dir: "asc" })
    );
    const partial: AllGridPrefs = { orderBlotter: { ...initial.orderBlotter } };
    const state = reducer(withData, setAllPrefs(partial));
    // executions unchanged
    expect(state.executions.sortField).toBe("strategy");
  });
});
