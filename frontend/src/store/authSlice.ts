import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { AuthRole } from "../auth/rbac.ts";

export type TradingStyle =
  | "high_touch"
  | "low_touch"
  | "fi_voice"
  | "fx_electronic"
  | "commodities_voice"
  | "derivatives_high_touch"
  | "derivatives_low_touch"
  | "oversight";

export type PrimaryDesk =
  | "equity-cash"
  | "equity-derivs"
  | "fi-rates"
  | "fi-credit"
  | "fi-govies"
  | "fx-cash"
  | "commodities"
  | "cross-desk";

export interface AuthUser {
  id: string;
  name: string;
  role: AuthRole;
  avatar_emoji: string;
}

export interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
  allowed_desks: string[];
  dark_pool_access: boolean;
  trading_style?: TradingStyle;
  primary_desk?: PrimaryDesk;
}

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
  allowed_desks: ["equity"],
  dark_pool_access: false,
};

interface AuthState {
  user: AuthUser | null;
  limits: TradingLimits;
  status: "loading" | "authenticated" | "unauthenticated";
  // When true, AuthGate renders the LoginPage modal over the dashboard.
  // Toggled by the "Sign in" CTA in the header for read-only visitors,
  // and after a failed session restore (status flips to unauthenticated
  // but visitors stay on the read-only dashboard by default).
  showLogin: boolean;
}

const initialState: AuthState = {
  user: null,
  limits: DEFAULT_LIMITS,
  status: "loading",
  showLogin: false,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = "authenticated";
      state.showLogin = false;
    },
    setUserWithLimits(state, action: PayloadAction<{ user: AuthUser; limits: TradingLimits }>) {
      state.user = action.payload.user;
      state.limits = action.payload.limits;
      state.status = "authenticated";
      state.showLogin = false;
    },
    setLimits(state, action: PayloadAction<TradingLimits>) {
      state.limits = action.payload;
    },
    clearUser(state) {
      state.user = null;
      state.limits = DEFAULT_LIMITS;
      state.status = "unauthenticated";
    },
    setStatus(state, action: PayloadAction<AuthState["status"]>) {
      state.status = action.payload;
    },
    setShowLogin(state, action: PayloadAction<boolean>) {
      state.showLogin = action.payload;
    },
  },
});

export const { setUser, setUserWithLimits, setLimits, clearUser, setStatus, setShowLogin } =
  authSlice.actions;

// Read-only mode: anonymous visitors can explore the dashboard (market
// data, charts, system health, live order flow as observers) but cannot
// trigger any write action. This selector is the single source of truth
// for "should this control be disabled / hidden?" — checked by every
// interactive component (submit order, kill switch, admin tools, etc.).
//
// `readOnly` is true when no user is signed in. Once authenticated the
// per-role gates (trader-only "+ New Order", admin-only kill switch)
// take over from the existing rbac helpers.
export function selectIsReadOnly(state: { auth: AuthState }): boolean {
  return state.auth.user === null;
}
