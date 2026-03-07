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

function shouldSkipPost(actionType: string): boolean {
  if (SKIP_POST.has(actionType)) return true;
  if (actionType.startsWith("analyticsApi/")) return true;
  if (actionType.startsWith("servicesApi/")) return true;
  return false;
}

let worker: Worker | null = null;

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("../../workers/obs.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.postMessage({ type: "init", url: OBS_URL });
  } catch {
    worker = null;
  }
  return worker;
}

function postEvent(type: string, payload: Record<string, unknown>) {
  const evt: ObsEvent = { type, ts: Date.now(), payload };
  const w = getWorker();
  if (w) {
    w.postMessage({ type: "event", event: evt });
  }
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
    if (!shouldSkipPost(actionType)) {
      const { type: _type, ...rest } = action as { type: string; [k: string]: unknown };
      postEvent(`client.action.${actionType}`, rest);
    }

    return next(action);
  };
};
