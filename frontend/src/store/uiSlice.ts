import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { OrderSide, Strategy } from "../types.ts";
import type { RootState } from "./index.ts";

const GATEWAY_PREFS_URL = `${import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway"}/preferences`;

interface OptionPrefill {
  strike: number;
  expirySecs: number;
}

export interface WindowSize {
  w: number;
  h: number;
}

interface UpgradeStatus {
  inProgress: boolean;
  message: string | null;
}

interface UiState {
  activeStrategy: Strategy;
  activeSide: OrderSide;
  showShortcuts: boolean;
  selectedAsset: string | null;
  updateAvailable: boolean;
  upgradeStatus: UpgradeStatus;
  /** Set by VolSurfacePanel when a cell is clicked — consumed by OptionPricingPanel. */
  optionPrefill: OptionPrefill | null;
  /** Persisted order-ticket pop-out window dimensions. */
  orderTicketWindowSize: WindowSize;
}

const initialState: UiState = {
  activeStrategy: "TWAP",
  activeSide: "BUY",
  showShortcuts: false,
  selectedAsset: null,
  updateAvailable: false,
  upgradeStatus: { inProgress: false, message: null },
  optionPrefill: null,
  orderTicketWindowSize: { w: 480, h: 780 },
};

export const loadUiPrefs = createAsyncThunk("ui/loadPrefs", async () => {
  const res = await fetch(GATEWAY_PREFS_URL, { credentials: "include" });
  if (!res.ok) return null;
  const blob = (await res.json()) as Record<string, unknown>;
  const size = blob?.orderTicketWindowSize as WindowSize | undefined;
  if (size && typeof size.w === "number" && typeof size.h === "number") {
    return size;
  }
  return null;
});

export const saveOrderTicketWindowSize = createAsyncThunk(
  "ui/saveOrderTicketWindowSize",
  async (size: WindowSize) => {
    const existing = await fetch(GATEWAY_PREFS_URL, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    await fetch(GATEWAY_PREFS_URL, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...existing, orderTicketWindowSize: size }),
    });
    return size;
  }
);

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setActiveStrategy(state, action: PayloadAction<Strategy>) {
      state.activeStrategy = action.payload;
    },
    setActiveSide(state, action: PayloadAction<OrderSide>) {
      state.activeSide = action.payload;
    },
    toggleShortcuts(state) {
      state.showShortcuts = !state.showShortcuts;
    },
    hideShortcuts(state) {
      state.showShortcuts = false;
    },
    setSelectedAsset(state, action: PayloadAction<string | null>) {
      state.selectedAsset = action.payload;
    },
    setUpdateAvailable(state) {
      state.updateAvailable = true;
    },
    setUpgradeStatus(state, action: PayloadAction<UpgradeStatus>) {
      state.upgradeStatus = action.payload;
    },
    setOptionPrefill(state, action: PayloadAction<OptionPrefill | null>) {
      state.optionPrefill = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadUiPrefs.fulfilled, (state, action) => {
        if (action.payload) state.orderTicketWindowSize = action.payload;
      })
      .addCase(saveOrderTicketWindowSize.fulfilled, (state, action) => {
        state.orderTicketWindowSize = action.payload;
      });
  },
});

export const selectOrderTicketWindowSize = (state: RootState) => state.ui.orderTicketWindowSize;

export const {
  setActiveStrategy,
  setActiveSide,
  toggleShortcuts,
  hideShortcuts,
  setSelectedAsset,
  setUpdateAvailable,
  setUpgradeStatus,
  setOptionPrefill,
} = uiSlice.actions;
