import type { Middleware } from "@reduxjs/toolkit";
import { alertAdded, alertDismissed, allAlertsDismissed } from "../alertsSlice.ts";
import { allBlocksCleared, blockAdded } from "../killSwitchSlice.ts";
import { orderPatched } from "../ordersSlice.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";
const ALERTS_URL = `${_origin}/api/gateway/alerts`;

function postAlert(alert: {
  id: string;
  severity: string;
  source: string;
  message: string;
  detail?: string;
  ts: number;
}) {
  fetch(ALERTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(alert),
  }).catch(() => {});
}

function dismissAlert(id: string) {
  fetch(`${ALERTS_URL}/${id}/dismiss`, {
    method: "PUT",
    credentials: "include",
  }).catch(() => {});
}

function dismissAllAlerts() {
  fetch(`${ALERTS_URL}/dismiss-all`, {
    method: "PUT",
    credentials: "include",
  }).catch(() => {});
}

export const alertsMiddleware: Middleware = (storeAPI) => {
  if (typeof window !== "undefined") {
    window.addEventListener("workspace-save-error", () => {
      storeAPI.dispatch(
        alertAdded({
          severity: "INFO",
          source: "workspace",
          message: "Workspace save failed — your layout changes may not have been persisted.",
          ts: Date.now(),
        })
      );
    });
  }

  return (next) => (action) => {
    const result = next(action);

    if (blockAdded.match(action) && action.payload.fromGateway) {
      const b = action.payload;
      const scopeDetail =
        b.scope === "all"
          ? "all orders halted"
          : b.scope === "user"
            ? "user trading halted"
            : `${b.scope}: ${b.scopeValues.join(", ")}`;
      storeAPI.dispatch(
        alertAdded({
          severity: "CRITICAL",
          source: "kill-switch",
          message: `Kill switch activated — ${scopeDetail}`,
          detail: `Issued by ${b.issuedBy}`,
          ts: b.issuedAt,
        })
      );
    }

    if (allBlocksCleared.match(action)) {
      storeAPI.dispatch(
        alertAdded({
          severity: "INFO",
          source: "kill-switch",
          message: "Kill switch cleared — trading resumed",
          ts: Date.now(),
        })
      );
    }

    if (orderPatched.match(action) && action.payload.patch.status === "rejected") {
      storeAPI.dispatch(
        alertAdded({
          severity: "WARNING",
          source: "order",
          message: `Order rejected: ${action.payload.id}`,
          ts: Date.now(),
        })
      );
    }

    if (alertAdded.match(action)) {
      if (action.payload.source !== "service") {
        const a = (
          storeAPI.getState() as {
            alerts: {
              alerts: Array<{
                id: string;
                severity: string;
                source: string;
                message: string;
                detail?: string;
                ts: number;
              }>;
            };
          }
        ).alerts.alerts[0];
        if (a) postAlert(a);
      }
    }

    if (alertDismissed.match(action)) {
      dismissAlert(action.payload);
    }

    if (allAlertsDismissed.match(action)) {
      dismissAllAlerts();
    }

    return result;
  };
};
