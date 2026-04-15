import type { PayloadAction } from "@reduxjs/toolkit";
import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "./index.ts";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type AlertSource = "kill-switch" | "service" | "algo" | "order" | "workspace";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  source: AlertSource;
  message: string;
  detail?: string;
  ts: number;
  dismissed: boolean;
}

export interface MuteRule {
  id: string;
  source?: AlertSource;
  severity?: AlertSeverity;
  messageContains?: string;
  createdAt: number;
}

function alertMatchesMuteRule(alert: Alert, rule: MuteRule): boolean {
  if (rule.source && alert.source !== rule.source) return false;
  if (rule.severity && alert.severity !== rule.severity) return false;
  if (
    rule.messageContains &&
    !alert.message.toLowerCase().includes(rule.messageContains.toLowerCase())
  )
    return false;
  return true;
}

const MAX_ALERTS = 200;

interface AlertsState {
  alerts: Alert[];
  muteRules: MuteRule[];
}

const initialState: AlertsState = { alerts: [], muteRules: [] };

export const alertsSlice = createSlice({
  name: "alerts",
  initialState,
  reducers: {
    alertAdded(state, action: PayloadAction<Omit<Alert, "id" | "dismissed">>) {
      const alert: Alert = {
        ...action.payload,
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dismissed: false,
      };
      state.alerts.unshift(alert);
      if (state.alerts.length > MAX_ALERTS) {
        state.alerts.length = MAX_ALERTS;
      }
    },
    alertDismissed(state, action: PayloadAction<string>) {
      const a = state.alerts.find((x) => x.id === action.payload);
      if (a) a.dismissed = true;
    },
    allAlertsDismissed(state) {
      for (const a of state.alerts) a.dismissed = true;
    },
    alertsLoaded(state, action: PayloadAction<Alert[]>) {
      state.alerts = action.payload.slice(0, MAX_ALERTS);
    },
    purgeServiceAlerts(state) {
      state.alerts = state.alerts.filter((a) => a.source !== "service");
    },
    muteRuleAdded(state, action: PayloadAction<Omit<MuteRule, "id" | "createdAt">>) {
      state.muteRules.push({
        ...action.payload,
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
      });
    },
    muteRuleRemoved(state, action: PayloadAction<string>) {
      state.muteRules = state.muteRules.filter((r) => r.id !== action.payload);
    },
    allMuteRulesCleared(state) {
      state.muteRules = [];
    },
  },
});

export const {
  alertAdded,
  alertDismissed,
  allAlertsDismissed,
  alertsLoaded,
  purgeServiceAlerts,
  muteRuleAdded,
  muteRuleRemoved,
  allMuteRulesCleared,
} = alertsSlice.actions;

export const selectMuteRules = (s: RootState) => s.alerts.muteRules;

export const selectActiveAlerts = createSelector(
  (s: RootState) => s.alerts.alerts,
  (s: RootState) => s.alerts.muteRules,
  (alerts, muteRules) =>
    alerts.filter((a) => !a.dismissed && !muteRules.some((rule) => alertMatchesMuteRule(a, rule)))
);

export const selectAllUnmutedAlerts = createSelector(
  (s: RootState) => s.alerts.alerts,
  (s: RootState) => s.alerts.muteRules,
  (alerts, muteRules) =>
    alerts.filter((a) => !muteRules.some((rule) => alertMatchesMuteRule(a, rule)))
);

export const selectCriticalAlerts = createSelector(selectActiveAlerts, (alerts) =>
  alerts.filter((a) => a.severity === "CRITICAL")
);

export const selectAlertCount = createSelector(
  selectActiveAlerts,
  (alerts) => alerts.filter((a) => a.severity !== "INFO").length
);

export const selectHighestSeverity = createSelector(
  selectActiveAlerts,
  (alerts): AlertSeverity | null => {
    if (alerts.some((a) => a.severity === "CRITICAL")) return "CRITICAL";
    if (alerts.some((a) => a.severity === "WARNING")) return "WARNING";
    if (alerts.some((a) => a.severity === "INFO")) return "INFO";
    return null;
  }
);
