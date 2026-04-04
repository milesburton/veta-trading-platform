import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type {
  AllGridPrefs,
  ConditionalFormatRule,
  ExprGroup,
  FilterCriteria,
  GridPrefs,
} from "../types/gridPrefs.ts";
import { EMPTY_EXPR_GROUP, EMPTY_GRID_PREFS } from "../types/gridPrefs.ts";
import type { RootState } from "./index.ts";

export type GridId =
  | "orderBlotter"
  | "executions"
  | "algoMonitor"
  | "childOrders"
  | "marketMatch"
  | "marketLadder";

interface GridPrefsState {
  orderBlotter: GridPrefs;
  executions: GridPrefs;
  algoMonitor: GridPrefs;
  childOrders: GridPrefs;
  marketMatch: GridPrefs;
  marketLadder: GridPrefs;
  loading: boolean;
}

const initialState: GridPrefsState = {
  orderBlotter: { ...EMPTY_GRID_PREFS },
  executions: { ...EMPTY_GRID_PREFS },
  algoMonitor: { ...EMPTY_GRID_PREFS },
  childOrders: { ...EMPTY_GRID_PREFS },
  marketMatch: { ...EMPTY_GRID_PREFS },
  marketLadder: { ...EMPTY_GRID_PREFS },
  loading: false,
};

function migrateCfRules(rules: ConditionalFormatRule[]): ConditionalFormatRule[] {
  return rules.map((r) => {
    if (r.expr) return r;
    const legacy = r as ConditionalFormatRule & {
      field?: string;
      op?: string;
      value?: unknown;
    };
    const ruleNode = legacy.field
      ? [
          {
            kind: "rule" as const,
            id: uuidv4(),
            field: legacy.field,
            op: (legacy.op ?? "=") as ExprGroup["rules"][number] extends { op: infer O }
              ? O
              : never,
            value: (legacy.value ?? "") as string,
          },
        ]
      : [];
    return {
      id: r.id,
      scope: r.scope,
      cellField: legacy.field,
      expr: {
        kind: "group" as const,
        id: uuidv4(),
        join: "AND" as const,
        rules: ruleNode,
      },
      style: r.style,
      label: r.label,
    } satisfies ConditionalFormatRule;
  });
}

function migratePrefs(raw: GridPrefs): GridPrefs {
  return {
    ...EMPTY_GRID_PREFS,
    ...raw,
    filterExpr: raw.filterExpr ?? EMPTY_EXPR_GROUP,
    cfRules: migrateCfRules(raw.cfRules ?? []),
    columnWidths: raw.columnWidths ?? {},
    columnOrder: raw.columnOrder ?? [],
  };
}

const GATEWAY_PREFS_URL = `${import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway"}/preferences`;

export const loadGridPrefs = createAsyncThunk("gridPrefs/load", async () => {
  const res = await fetch(GATEWAY_PREFS_URL);
  if (!res.ok) return null;
  const blob = await res.json();
  return (blob?.gridPrefs ?? null) as AllGridPrefs | null;
});

export const saveGridPrefs = createAsyncThunk("gridPrefs/save", async (_, { getState }) => {
  const state = getState() as RootState;
  const existing = await fetch(GATEWAY_PREFS_URL)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));

  const merged = {
    ...existing,
    gridPrefs: {
      orderBlotter: state.gridPrefs.orderBlotter,
      executions: state.gridPrefs.executions,
      algoMonitor: state.gridPrefs.algoMonitor,
      childOrders: state.gridPrefs.childOrders,
      marketMatch: state.gridPrefs.marketMatch,
      marketLadder: state.gridPrefs.marketLadder,
    } satisfies AllGridPrefs,
  };

  await fetch(GATEWAY_PREFS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });
});

export const gridPrefsSlice = createSlice({
  name: "gridPrefs",
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<{ gridId: GridId; filters: FilterCriteria[] }>) {
      state[action.payload.gridId].filters = action.payload.filters;
    },
    setFilterExpr(state, action: PayloadAction<{ gridId: GridId; expr: ExprGroup }>) {
      state[action.payload.gridId].filterExpr = action.payload.expr;
    },
    setSort(
      state,
      action: PayloadAction<{
        gridId: GridId;
        field: string | null;
        dir: "asc" | "desc" | null;
      }>
    ) {
      state[action.payload.gridId].sortField = action.payload.field;
      state[action.payload.gridId].sortDir = action.payload.dir;
    },
    setCfRules(state, action: PayloadAction<{ gridId: GridId; rules: ConditionalFormatRule[] }>) {
      state[action.payload.gridId].cfRules = action.payload.rules;
    },
    setColumnWidth(state, action: PayloadAction<{ gridId: GridId; key: string; width: number }>) {
      state[action.payload.gridId].columnWidths[action.payload.key] = action.payload.width;
    },
    setColumnOrder(state, action: PayloadAction<{ gridId: GridId; order: string[] }>) {
      state[action.payload.gridId].columnOrder = action.payload.order;
    },
    resetGrid(state, action: PayloadAction<{ gridId: GridId }>) {
      state[action.payload.gridId] = {
        ...EMPTY_GRID_PREFS,
        filterExpr: { ...EMPTY_EXPR_GROUP, rules: [] },
      };
    },
    setAllPrefs(state, action: PayloadAction<AllGridPrefs>) {
      const ids: GridId[] = [
        "orderBlotter",
        "executions",
        "algoMonitor",
        "childOrders",
        "marketMatch",
        "marketLadder",
      ];
      for (const id of ids) {
        if (action.payload[id]) {
          state[id] = migratePrefs(action.payload[id]);
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadGridPrefs.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadGridPrefs.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return;
        const ids: GridId[] = [
          "orderBlotter",
          "executions",
          "algoMonitor",
          "childOrders",
          "marketMatch",
          "marketLadder",
        ];
        for (const id of ids) {
          if (action.payload[id]) {
            state[id] = migratePrefs(action.payload[id]);
          }
        }
      })
      .addCase(loadGridPrefs.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const {
  setFilters,
  setFilterExpr,
  setSort,
  setCfRules,
  setColumnWidth,
  setColumnOrder,
  resetGrid,
  setAllPrefs,
} = gridPrefsSlice.actions;
