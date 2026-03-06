import type { Middleware } from "@reduxjs/toolkit";
import type { ObsEvent } from "../../types.ts";
import { observabilitySlice } from "../observabilitySlice.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";
const OBS_URL = import.meta.env.VITE_OBS_URL ?? `${_origin}/api/observability`;

const SKIP_POST = new Set([
  "observability/eventReceived",
  "observability/historicEventsLoaded",
  "observability/reportError",
  "observability/stop",
  "market/tickReceived",
  "market/orderBookUpdated",
  "market/candleUpdated",
  "market/candlesSeeded",
  "market/setAssets",
  "news/newsItemReceived",
  "news/newsBatchReceived",
]);

function postEvent(type: string, payload: Record<string, unknown>) {
  const evt: ObsEvent = { type, ts: Date.now(), payload };
  fetch(`${OBS_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(evt),
    credentials: "include",
  }).catch(() => {});
}

export const observabilityMiddleware: Middleware = (storeAPI) => {
  let es: EventSource | null = null;
  let started = false;
  let reconnectDelay = 2_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    fetch(`${OBS_URL}/events`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as ObsEvent[];
        storeAPI.dispatch(observabilitySlice.actions.historicEventsLoaded(data ?? []));
      })
      .catch(() => {});

    es = new EventSource(`${OBS_URL}/stream`);

    es.onopen = () => {
      reconnectDelay = 2_000;
    };

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as ObsEvent;
        storeAPI.dispatch(observabilitySlice.actions.eventReceived(parsed));
      } catch {
        /* ignore parse errors */
      }
    };

    es.onerror = () => {
      es?.close();
      es = null;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    };
  }

  return (next) => (action: unknown) => {
    if (!started) {
      started = true;
      connect();
    }
    if ((action as { type: string }).type === "observability/stop") {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }

    const actionType = (action as { type: string }).type;
    if (!SKIP_POST.has(actionType)) {
      const { type: _type, ...rest } = action as { type: string; [k: string]: unknown };
      postEvent(`client.action.${actionType}`, rest);
    }

    return next(action);
  };
};
