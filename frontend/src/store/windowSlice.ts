import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { isSafeKey } from "./safeKey.ts";

// String-keyed by instance ID so any panel (including multi-instances) can pop out or open in dialog
interface WindowState {
  popOuts: Record<string, { open: boolean }>;
  dialogs: Record<string, { open: boolean; panelType: string }>;
}

const initialState: WindowState = {
  popOuts: {},
  dialogs: {},
};

export const windowSlice = createSlice({
  name: "windows",
  initialState,
  reducers: {
    panelPopped(state, action: PayloadAction<{ panelId: string }>) {
      const { panelId } = action.payload;
      if (!isSafeKey(panelId)) return;
      state.popOuts[panelId] = { open: true };
    },
    panelClosed(state, action: PayloadAction<{ panelId: string }>) {
      const { panelId } = action.payload;
      if (!isSafeKey(panelId)) return;
      const entry = state.popOuts[panelId];
      if (entry) {
        entry.open = false;
      }
    },
    panelDialogOpened(state, action: PayloadAction<{ panelId: string; panelType: string }>) {
      const { panelId, panelType } = action.payload;
      if (!isSafeKey(panelId)) return;
      state.dialogs[panelId] = {
        open: true,
        panelType,
      };
    },
    panelDialogClosed(state, action: PayloadAction<{ panelId: string }>) {
      const { panelId } = action.payload;
      if (!isSafeKey(panelId)) return;
      const entry = state.dialogs[panelId];
      if (entry) {
        entry.open = false;
      }
    },
  },
});

export const { panelPopped, panelClosed, panelDialogOpened, panelDialogClosed } =
  windowSlice.actions;

export type { PanelId } from "../components/dashboard/panelRegistry.ts";
