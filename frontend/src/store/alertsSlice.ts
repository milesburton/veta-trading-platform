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

const MAX_ALERTS = 200;

interface AlertsState {
  alerts: Alert[];
}

const initialState: AlertsState = { alerts: [] };

export const alertsSlice = createSlice({
  name: "alerts",
  initialState,
  reducers: {
    alertAdded(state, action: PayloadAction<Omit<Alert, "id" | "dismissed">>) {
      const alert: Alert = {
        ...action.payload,
        id: crypto.randomUUID(),
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
  },
});

export const { alertAdded, alertDismissed, allAlertsDismissed, alertsLoaded, purgeServiceAlerts } =
  alertsSlice.actions;

export const selectActiveAlerts = createSelector(
  (s: RootState) => s.alerts.alerts,
  (alerts) => alerts.filter((a) => !a.dismissed)
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
