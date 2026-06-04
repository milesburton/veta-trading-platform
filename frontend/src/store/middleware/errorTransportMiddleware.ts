import type { Middleware } from "@reduxjs/toolkit";
import { reportError } from "@veta/frontend/store/observabilitySlice.ts";

const OBS_URL = "/api/gateway/api/kafka-relay/events/batch";
const BATCH_FLUSH_MS = 500;
const BATCH_MAX = 20;

type Event = {
  type: "client.error";
  ts: number;
  payload: ReturnType<typeof reportError>["payload"];
};

const pending: Event[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (pending.length === 0) return;
  const batch = pending.splice(0, pending.length);
  fetch(OBS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: batch }),
    keepalive: true,
  }).catch(() => {});
}

if (typeof window !== "undefined") {
  globalThis.addEventListener("beforeunload", flush);
}

export const errorTransportMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);
  if (reportError.match(action as never)) {
    const payload = (action as ReturnType<typeof reportError>).payload;
    pending.push({ type: "client.error", ts: Date.now(), payload });
    if (pending.length >= BATCH_MAX) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(flush, BATCH_FLUSH_MS);
    }
  }
  return result;
};
