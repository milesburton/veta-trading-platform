import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { OrderSide, Strategy } from "@veta/frontend/types.ts";
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

export type AlgoMonitorTab = "active" | "needs-action" | "history";
export type ObservabilityTab = "summary" | "trades" | "events";

interface UiState {
  activeStrategy: Strategy;
  activeSide: OrderSide;
  showShortcuts: boolean;
  selectedAsset: string | null;
  updateAvailable: boolean;
  upgradeStatus: UpgradeStatus;
  optionPrefill: OptionPrefill | null;
  orderTicketWindowSize: WindowSize;
  algoMonitorTab: AlgoMonitorTab;
  showHeartbeats: boolean;
  observabilityTab: ObservabilityTab;
  showOverridesOnly: boolean;
}

interface PersistedUiPrefs {
  orderTicketWindowSize?: WindowSize;
  activeStrategy?: Strategy;
  activeSide?: OrderSide;
  selectedAsset?: string | null;
  algoMonitorTab?: AlgoMonitorTab;
  showHeartbeats?: boolean;
  observabilityTab?: ObservabilityTab;
  showOverridesOnly?: boolean;
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
  algoMonitorTab: "active",
  showHeartbeats: false,
  observabilityTab: "summary",
  showOverridesOnly: false,
};

const VALID_STRATEGIES: Strategy[] = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
];
const VALID_SIDES: OrderSide[] = ["BUY", "SELL"];
const VALID_ALGO_TABS: AlgoMonitorTab[] = ["active", "needs-action", "history"];
const VALID_OBS_TABS: ObservabilityTab[] = ["summary", "trades", "events"];

function parseUiPrefs(blob: Record<string, unknown>): PersistedUiPrefs {
  const prefs: PersistedUiPrefs = {};

  const size = blob.orderTicketWindowSize as WindowSize | undefined;
  if (size && typeof size.w === "number" && typeof size.h === "number") {
    prefs.orderTicketWindowSize = size;
  }

  const strategy = blob.activeStrategy as Strategy | undefined;
  if (strategy && VALID_STRATEGIES.includes(strategy)) prefs.activeStrategy = strategy;

  const side = blob.activeSide as OrderSide | undefined;
  if (side && VALID_SIDES.includes(side)) prefs.activeSide = side;

  if (typeof blob.selectedAsset === "string" || blob.selectedAsset === null) {
    prefs.selectedAsset = blob.selectedAsset as string | null;
  }

  const algoTab = blob.algoMonitorTab as AlgoMonitorTab | undefined;
  if (algoTab && VALID_ALGO_TABS.includes(algoTab)) prefs.algoMonitorTab = algoTab;

  if (typeof blob.showHeartbeats === "boolean") prefs.showHeartbeats = blob.showHeartbeats;

  const obsTab = blob.observabilityTab as ObservabilityTab | undefined;
  if (obsTab && VALID_OBS_TABS.includes(obsTab)) prefs.observabilityTab = obsTab;

  if (typeof blob.showOverridesOnly === "boolean") prefs.showOverridesOnly = blob.showOverridesOnly;

  return prefs;
}

export const loadUiPrefs = createAsyncThunk("ui/loadPrefs", async () => {
  const res = await fetch(GATEWAY_PREFS_URL, { credentials: "include" });
  if (!res.ok) return null;
  const blob = (await res.json()) as Record<string, unknown>;
  return parseUiPrefs(blob);
});

export const saveUiPrefs = createAsyncThunk("ui/savePrefs", async (_: undefined, { getState }) => {
  const state = getState() as RootState;
  const ui = state.ui;
  const existing = await fetch(GATEWAY_PREFS_URL, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  await fetch(GATEWAY_PREFS_URL, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...existing,
      orderTicketWindowSize: ui.orderTicketWindowSize,
      activeStrategy: ui.activeStrategy,
      activeSide: ui.activeSide,
      selectedAsset: ui.selectedAsset,
      algoMonitorTab: ui.algoMonitorTab,
      showHeartbeats: ui.showHeartbeats,
      observabilityTab: ui.observabilityTab,
      showOverridesOnly: ui.showOverridesOnly,
    }),
  });
});

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
    dismissUpdateAvailable(state) {
      state.updateAvailable = false;
    },
    setUpgradeStatus(state, action: PayloadAction<UpgradeStatus>) {
      state.upgradeStatus = action.payload;
    },
    setOptionPrefill(state, action: PayloadAction<OptionPrefill | null>) {
      state.optionPrefill = action.payload;
    },
    setAlgoMonitorTab(state, action: PayloadAction<AlgoMonitorTab>) {
      state.algoMonitorTab = action.payload;
    },
    setShowHeartbeats(state, action: PayloadAction<boolean>) {
      state.showHeartbeats = action.payload;
    },
    setObservabilityTab(state, action: PayloadAction<ObservabilityTab>) {
      state.observabilityTab = action.payload;
    },
    setShowOverridesOnly(state, action: PayloadAction<boolean>) {
      state.showOverridesOnly = action.payload;
    },
    setOrderTicketWindowSize(state, action: PayloadAction<WindowSize>) {
      state.orderTicketWindowSize = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUiPrefs.fulfilled, (state, action) => {
      if (!action.payload) return;
      const p = action.payload;
      if (p.orderTicketWindowSize) state.orderTicketWindowSize = p.orderTicketWindowSize;
      if (p.activeStrategy) state.activeStrategy = p.activeStrategy;
      if (p.activeSide) state.activeSide = p.activeSide;
      if (p.selectedAsset !== undefined) state.selectedAsset = p.selectedAsset;
      if (p.algoMonitorTab) state.algoMonitorTab = p.algoMonitorTab;
      if (p.showHeartbeats !== undefined) state.showHeartbeats = p.showHeartbeats;
      if (p.observabilityTab) state.observabilityTab = p.observabilityTab;
      if (p.showOverridesOnly !== undefined) state.showOverridesOnly = p.showOverridesOnly;
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
  dismissUpdateAvailable,
  setUpgradeStatus,
  setOptionPrefill,
  setAlgoMonitorTab,
  setShowHeartbeats,
  setObservabilityTab,
  setShowOverridesOnly,
  setOrderTicketWindowSize,
} = uiSlice.actions;
