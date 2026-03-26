import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { Strategy } from "../types.ts";

interface OptionPrefill {
  strike: number;
  expirySecs: number;
}

interface UiState {
  activeStrategy: Strategy;
  activeSide: "BUY" | "SELL";
  showShortcuts: boolean;
  selectedAsset: string | null;
  updateAvailable: boolean;
  /** Set by VolSurfacePanel when a cell is clicked — consumed by OptionPricingPanel. */
  optionPrefill: OptionPrefill | null;
  /** Controls the Order Ticket modal dialog (fat-finger protection). */
  orderTicketOpen: boolean;
}

const initialState: UiState = {
  activeStrategy: "TWAP",
  activeSide: "BUY",
  showShortcuts: false,
  selectedAsset: null,
  updateAvailable: false,
  optionPrefill: null,
  orderTicketOpen: false,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setActiveStrategy(state, action: PayloadAction<Strategy>) {
      state.activeStrategy = action.payload;
    },
    setActiveSide(state, action: PayloadAction<"BUY" | "SELL">) {
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
    setOptionPrefill(state, action: PayloadAction<OptionPrefill | null>) {
      state.optionPrefill = action.payload;
    },
    openOrderTicket(state) {
      state.orderTicketOpen = true;
    },
    closeOrderTicket(state) {
      state.orderTicketOpen = false;
    },
  },
});

export const {
  setActiveStrategy,
  setActiveSide,
  toggleShortcuts,
  hideShortcuts,
  setSelectedAsset,
  setUpdateAvailable,
  setOptionPrefill,
  openOrderTicket,
  closeOrderTicket,
} = uiSlice.actions;
