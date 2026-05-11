import type { Middleware } from "@reduxjs/toolkit";
import { reportError } from "../observabilitySlice.ts";

const OBS_URL = "/api/gateway/api/kafka-relay/events/batch";

export const errorTransportMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);
  if (reportError.match(action as never)) {
    const payload = (action as ReturnType<typeof reportError>).payload;
    const event = {
      type: "client.error" as const,
      ts: Date.now(),
      payload,
    };
    fetch(OBS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [event] }),
      keepalive: true,
    }).catch(() => {
      // Transport failure is non-fatal: errors remain in the in-memory ring buffer.
    });
  }
  return result;
};
