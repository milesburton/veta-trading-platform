import type { Middleware } from "@reduxjs/toolkit";
import { SPREAD_WARNING_THRESHOLD_BPS } from "@veta/frontend/domain/ticket/rules/spread-check.ts";
import {
  alertAdded,
  alertDismissed,
  allAlertsDismissed,
} from "@veta/frontend/store/alertsSlice.ts";
import { allBlocksCleared, blockAdded } from "@veta/frontend/store/killSwitchSlice.ts";
import { orderBookUpdated } from "@veta/frontend/store/marketSlice.ts";
import { orderPatched } from "@veta/frontend/store/ordersSlice.ts";
import type { OrderBookSnapshot } from "@veta/frontend/types.ts";

const _origin = typeof window !== "undefined" ? globalThis.location.origin : "";
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

function spreadBps(book: OrderBookSnapshot): number | null {
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (!bid || !ask || book.mid <= 0) return null;
  return ((ask - bid) / book.mid) * 10_000;
}

export const alertsMiddleware: Middleware = (storeAPI) => {
  const spreadAlertedSymbols = new Set<string>();

  if (typeof window !== "undefined") {
    globalThis.addEventListener("workspace-save-error", () => {
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
          relatedTopic: "orders.kill",
          relatedAt: b.issuedAt,
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
          relatedTopic: "orders.resume",
        })
      );
    }

    if (orderBookUpdated.match(action)) {
      const state = storeAPI.getState() as { ui: { selectedAsset: string | null } };
      const symbol = state.ui.selectedAsset;
      const book = symbol ? action.payload[symbol] : undefined;
      if (symbol && book) {
        const bps = spreadBps(book);
        const isWide = bps !== null && bps >= SPREAD_WARNING_THRESHOLD_BPS;
        if (isWide && !spreadAlertedSymbols.has(symbol)) {
          spreadAlertedSymbols.add(symbol);
          storeAPI.dispatch(
            alertAdded({
              severity: "WARNING",
              source: "market-data",
              message: `${symbol} bid-ask spread is ${(bps as number).toFixed(0)} bps — wider than normal`,
              ts: Date.now(),
            })
          );
        } else if (!isWide) {
          spreadAlertedSymbols.delete(symbol);
        }
      }
    }

    if (orderPatched.match(action) && action.payload.patch.status === "rejected") {
      storeAPI.dispatch(
        alertAdded({
          severity: "WARNING",
          source: "order",
          message: "Order rejected by risk engine",
          detail: action.payload.id,
          ts: Date.now(),
          relatedEventId: action.payload.id,
          relatedTopic: "orders.rejected",
          relatedAt: Date.now(),
        })
      );
    }

    if (alertAdded.match(action)) {
      const state = storeAPI.getState() as {
        auth: { user: { id: string } | null };
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
      };
      if (action.payload.source !== "service" && state.auth.user) {
        const a = state.alerts.alerts[0];
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
