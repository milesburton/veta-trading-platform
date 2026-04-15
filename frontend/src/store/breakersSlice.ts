import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export interface ActiveBreakerEntry {
  key: string;
  type: "market-move" | "user-pnl";
  scope: "symbol" | "user";
  target: string;
  observedValue: number;
  threshold: number;
  firedAt: number;
  expiresAt: number;
}

interface BreakersState {
  active: ActiveBreakerEntry[];
  cooldownMs: number;
}

const initialState: BreakersState = {
  active: [],
  cooldownMs: 60_000,
};

interface BreakerFiredPayload {
  type: "market-move" | "user-pnl";
  scope: "symbol" | "user";
  scopeValue?: string;
  targetUserId?: string;
  observedValue: number;
  threshold: number;
  ts: number;
}

export const breakersSlice = createSlice({
  name: "breakers",
  initialState,
  reducers: {
    breakerFired(state, action: PayloadAction<BreakerFiredPayload>) {
      const p = action.payload;
      const target = p.scope === "symbol" ? (p.scopeValue ?? "") : (p.targetUserId ?? "");
      if (!target) return;
      const key = `${p.type}:${target}`;
      const existing = state.active.find((a) => a.key === key);
      if (existing && existing.expiresAt > p.ts) return;
      const expiresAt = p.ts + state.cooldownMs;
      const entry: ActiveBreakerEntry = {
        key,
        type: p.type,
        scope: p.scope,
        target,
        observedValue: p.observedValue,
        threshold: p.threshold,
        firedAt: p.ts,
        expiresAt,
      };
      if (existing) {
        state.active = state.active.map((a) => (a.key === key ? entry : a));
      } else {
        state.active = [...state.active, entry];
      }
    },
    breakerExpired(state, action: PayloadAction<{ key: string }>) {
      state.active = state.active.filter((a) => a.key !== action.payload.key);
    },
    breakersReconciled(state, action: PayloadAction<ActiveBreakerEntry[]>) {
      state.active = action.payload;
    },
    cooldownUpdated(state, action: PayloadAction<number>) {
      state.cooldownMs = action.payload;
    },
  },
});

export const { breakerFired, breakerExpired, breakersReconciled, cooldownUpdated } =
  breakersSlice.actions;
