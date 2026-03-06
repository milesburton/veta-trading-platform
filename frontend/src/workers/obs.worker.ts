/**
 * Observability web worker.
 *
 * Receives ObsEvent objects from the main thread via postMessage, batches
 * them for FLUSH_INTERVAL_MS, then POSTs the batch to the observability
 * service. Runs entirely off the main thread so logging never blocks the UI.
 *
 * Drop policy: if the pending queue grows beyond MAX_QUEUE the oldest events
 * are dropped to protect memory when the tab is backgrounded or the network
 * is slow.
 */

interface ObsEvent {
  type: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

const FLUSH_INTERVAL_MS = 1_000;
const MAX_QUEUE = 200;

let obsUrl = "";
let queue: ObsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

async function flush() {
  flushTimer = null;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await fetch(`${obsUrl}/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(batch),
      keepalive: true,
    });
  } catch {
    // fire-and-forget — network errors are silently dropped
  }
}

self.onmessage = (
  ev: MessageEvent<{ type: "init"; url: string } | { type: "event"; event: ObsEvent }>
) => {
  const msg = ev.data;
  if (msg.type === "init") {
    obsUrl = msg.url;
    return;
  }
  if (msg.type === "event") {
    if (queue.length >= MAX_QUEUE) {
      queue.shift();
    }
    queue.push(msg.event);
    scheduleFlush();
  }
};
