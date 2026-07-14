import type { PayloadAction } from "@reduxjs/toolkit";
import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { RootState } from "./index.ts";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type AlertSource =
  | "kill-switch"
  | "service"
  | "algo"
  | "order"
  | "workspace"
  | "market-data";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  source: AlertSource;
  message: string;
  detail?: string;
  ts: number;
  /** Last time this dedupe-key fired; equals ts on a non-deduped alert. */
  lastTs?: number;
  /** Number of times this dedupe-key has fired in the dedupe window. Defaults to 1. */
  count?: number;
  dismissed: boolean;
  /** True once the user has seen this in the toast. Drives the toast's unread queue. */
  acknowledged?: boolean;
  /** Originating cause: the bus/journal event that triggered this alert. */
  relatedEventId?: string;
  /** Bus topic the related event came from (e.g. "orders.rejected"). */
  relatedTopic?: string;
  /** Timestamp of the related event. Often equal to ts but can differ when alerts are derived from older events. */
  relatedAt?: number;
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
const DEDUPE_WINDOW_MS = 30_000;
const DEDUPE_LOOKBACK = 10;

function dedupeKey(a: Pick<Alert, "severity" | "source" | "message">): string {
  return `${a.severity}:${a.source}:${a.message}`;
}

interface AlertsState {
  alerts: Alert[];
  muteRules: MuteRule[];
}

const initialState: AlertsState = { alerts: [], muteRules: [] };

export const alertsSlice = createSlice({
  name: "alerts",
  initialState,
  reducers: {
    alertAdded(state, action: PayloadAction<Omit<Alert, "id" | "dismissed" | "lastTs" | "count">>) {
      const incoming = action.payload;
      const key = dedupeKey(incoming);
      const cutoff = incoming.ts - DEDUPE_WINDOW_MS;
      const lookbackEnd = Math.min(state.alerts.length, DEDUPE_LOOKBACK);
      let matchIdx = -1;
      for (let i = 0; i < lookbackEnd; i++) {
        const a = state.alerts[i];
        if (a.dismissed) continue;
        const aTs = a.lastTs ?? a.ts;
        if (aTs < cutoff) break;
        if (dedupeKey(a) === key) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx >= 0) {
        const existing = state.alerts[matchIdx];
        existing.count = (existing.count ?? 1) + 1;
        existing.lastTs = incoming.ts;
        existing.acknowledged = false;
        if (incoming.detail) existing.detail = incoming.detail;
        if (incoming.relatedEventId) existing.relatedEventId = incoming.relatedEventId;
        if (incoming.relatedTopic) existing.relatedTopic = incoming.relatedTopic;
        if (incoming.relatedAt !== undefined) existing.relatedAt = incoming.relatedAt;
        if (matchIdx > 0) {
          state.alerts.splice(matchIdx, 1);
          state.alerts.unshift(existing);
        }
        return;
      }
      const alert: Alert = {
        ...incoming,
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        lastTs: incoming.ts,
        count: 1,
        dismissed: false,
      };
      state.alerts.unshift(alert);
      if (state.alerts.length > MAX_ALERTS) {
        state.alerts.length = MAX_ALERTS;
      }
    },
    alertDismissed(state, action: PayloadAction<string>) {
      const a = state.alerts.find((x) => x.id === action.payload);
      if (a) {
        a.dismissed = true;
        a.acknowledged = true;
      }
    },
    allAlertsDismissed(state) {
      for (const a of state.alerts) {
        a.dismissed = true;
        a.acknowledged = true;
      }
    },
    alertAcknowledged(state, action: PayloadAction<string>) {
      const a = state.alerts.find((x) => x.id === action.payload);
      if (a) a.acknowledged = true;
    },
    alertsLoaded(state, action: PayloadAction<Alert[]>) {
      state.alerts = action.payload.slice(0, MAX_ALERTS).map((a) => ({
        ...a,
        count: a.count ?? 1,
        lastTs: a.lastTs ?? a.ts,
      }));
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
  alertAcknowledged,
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

export const selectCriticalAlerts = createSelector(selectActiveAlerts, (alerts) =>
  alerts.filter((a) => a.severity === "CRITICAL")
);

/** Alerts the user has not yet acknowledged in the toast. INFO is excluded. */
export const selectToastQueue = createSelector(selectActiveAlerts, (alerts) =>
  alerts.filter((a) => !a.acknowledged && a.severity !== "INFO")
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
