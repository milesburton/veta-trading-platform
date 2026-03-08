import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export type LlmSubsystemState = "disabled" | "armed" | "active" | "cooldown" | "error";
export type LlmTriggerMode =
  | "disabled"
  | "manual"
  | "on-demand-ui"
  | "scheduled-batch"
  | "event-driven";

export interface LlmEffectivePolicy {
  enabled: boolean;
  workerEnabled: boolean;
  triggerMode: LlmTriggerMode;
  minRefreshMinutes: number;
  workerIdleTimeoutSeconds: number;
  workerMaxJobsPerSession: number;
  maxConcurrentJobs: number;
}

export interface LlmSubsystemStatus {
  state: LlmSubsystemState;
  policy: LlmEffectivePolicy;
  pendingJobs: number;
  trackedSymbols: number;
  triggerMode: LlmTriggerMode;
  workerEnabled: boolean;
  ts: number;
}

interface LlmSubsystemSliceState {
  status: LlmSubsystemStatus | null;
  lastUpdated: number | null;
}

const initialState: LlmSubsystemSliceState = {
  status: null,
  lastUpdated: null,
};

export const llmSubsystemSlice = createSlice({
  name: "llmSubsystem",
  initialState,
  reducers: {
    llmStateReceived(state, action: PayloadAction<LlmSubsystemStatus>) {
      state.status = action.payload;
      state.lastUpdated = Date.now();
    },
  },
});

export const { llmStateReceived } = llmSubsystemSlice.actions;
