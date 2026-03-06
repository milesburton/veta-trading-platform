import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type {
  AllGridPrefs,
  ConditionalFormatRule,
  FilterCriteria,
  GridPrefs,
} from "../types/gridPrefs.ts";
import { EMPTY_GRID_PREFS } from "../types/gridPrefs.ts";
import type { RootState } from "./index.ts";

export type GridId = "orderBlotter" | "executions";

interface GridPrefsState {
  orderBlotter: GridPrefs;
  executions: GridPrefs;
  loading: boolean;
}

const initialState: GridPrefsState = {
  orderBlotter: { ...EMPTY_GRID_PREFS },
  executions: { ...EMPTY_GRID_PREFS },
  loading: false,
};

// ── Async thunks ───────────────────────────────────────────────────────────────

export const loadGridPrefs = createAsyncThunk("gridPrefs/load", async () => {
  const res = await fetch("/api/gateway/preferences");
  if (!res.ok) return null;
  const blob = await res.json();
  return (blob?.gridPrefs ?? null) as AllGridPrefs | null;
});

export const saveGridPrefs = createAsyncThunk("gridPrefs/save", async (_, { getState }) => {
  const state = getState() as RootState;
  // First fetch existing prefs so we don't clobber other keys in the blob
  const existing = await fetch("/api/gateway/preferences")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));

  const merged = {
    ...existing,
    gridPrefs: {
      orderBlotter: state.gridPrefs.orderBlotter,
      executions: state.gridPrefs.executions,
    } satisfies AllGridPrefs,
  };

  await fetch("/api/gateway/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });
});

// ── Slice ──────────────────────────────────────────────────────────────────────

export const gridPrefsSlice = createSlice({
  name: "gridPrefs",
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<{ gridId: GridId; filters: FilterCriteria[] }>) {
      state[action.payload.gridId].filters = action.payload.filters;
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
    resetGrid(state, action: PayloadAction<{ gridId: GridId }>) {
      state[action.payload.gridId] = { ...EMPTY_GRID_PREFS };
    },
    setAllPrefs(state, action: PayloadAction<AllGridPrefs>) {
      if (action.payload.orderBlotter) {
        state.orderBlotter = action.payload.orderBlotter;
      }
      if (action.payload.executions) {
        state.executions = action.payload.executions;
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
        if (action.payload) {
          if (action.payload.orderBlotter) {
            state.orderBlotter = action.payload.orderBlotter;
          }
          if (action.payload.executions) {
            state.executions = action.payload.executions;
          }
        }
      })
      .addCase(loadGridPrefs.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const { setFilters, setSort, setCfRules, resetGrid, setAllPrefs } = gridPrefsSlice.actions;
