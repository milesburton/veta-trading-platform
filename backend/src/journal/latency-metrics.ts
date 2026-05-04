import { journalPool } from "@veta/db";

export interface StageStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface LatencyMetrics {
  windowMs: number;
  queriedAt: number;
  sampleSize: number;
  stages: {
    submittedToRouted: StageStats;
    routedToChild: StageStats;
    childToFilled: StageStats;
    submittedToFilled: StageStats;
    submittedToArrived: StageStats;
  };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarise(samples: number[]): StageStats {
  if (samples.length === 0) {
    return { count: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

export async function computeLatencyMetrics(windowMs: number): Promise<LatencyMetrics> {
  const now = Date.now();
  const since = new Date(now - windowMs);
  const client = await journalPool.connect();
  try {
    const { rows } = await client.queryArray(
      `SELECT order_id, child_id, event_type, ts, arrived_at
         FROM journal.events
        WHERE order_id IS NOT NULL
          AND ts >= $1
          AND event_type IN ('orders.submitted','orders.routed','orders.child','orders.filled')`,
      [since],
    );

    interface OrderTimings {
      submitted?: number;
      routed?: number;
      submittedArrived?: number;
      firstChild?: Map<string, number>;
      firstFilled?: Map<string, number>;
    }
    const byOrder = new Map<string, OrderTimings>();

    for (const row of rows as unknown[][]) {
      const [orderIdRaw, childIdRaw, eventType, tsRaw, arrivedRaw] = row;
      const orderId = orderIdRaw as string;
      const childId = childIdRaw as string | null;
      const tsMs = tsRaw instanceof Date ? tsRaw.getTime() : Number(tsRaw);
      const arrivedMs = arrivedRaw instanceof Date
        ? arrivedRaw.getTime()
        : arrivedRaw == null
        ? null
        : Number(arrivedRaw);

      let entry = byOrder.get(orderId);
      if (!entry) {
        entry = {};
        byOrder.set(orderId, entry);
      }

      if (eventType === "orders.submitted") {
        if (entry.submitted == null || tsMs < entry.submitted) entry.submitted = tsMs;
        if (arrivedMs != null && entry.submittedArrived == null) {
          entry.submittedArrived = arrivedMs;
        }
      } else if (eventType === "orders.routed") {
        if (entry.routed == null || tsMs < entry.routed) entry.routed = tsMs;
      } else if (eventType === "orders.child" && childId) {
        if (!entry.firstChild) entry.firstChild = new Map();
        const prev = entry.firstChild.get(childId);
        if (prev == null || tsMs < prev) entry.firstChild.set(childId, tsMs);
      } else if (eventType === "orders.filled" && childId) {
        if (!entry.firstFilled) entry.firstFilled = new Map();
        const prev = entry.firstFilled.get(childId);
        if (prev == null || tsMs < prev) entry.firstFilled.set(childId, tsMs);
      }
    }

    const submittedToRouted: number[] = [];
    const routedToChild: number[] = [];
    const childToFilled: number[] = [];
    const submittedToFilled: number[] = [];
    const submittedToArrived: number[] = [];
    let sampleSize = 0;

    for (const entry of byOrder.values()) {
      if (entry.submitted == null) continue;
      sampleSize++;

      if (entry.submittedArrived != null) {
        submittedToArrived.push(Math.max(0, entry.submittedArrived - entry.submitted));
      }
      if (entry.routed != null) {
        submittedToRouted.push(Math.max(0, entry.routed - entry.submitted));
      }

      let earliestChild: number | undefined;
      if (entry.firstChild) {
        for (const t of entry.firstChild.values()) {
          if (earliestChild == null || t < earliestChild) earliestChild = t;
        }
      }
      if (entry.routed != null && earliestChild != null) {
        routedToChild.push(Math.max(0, earliestChild - entry.routed));
      }

      let latestFilled: number | undefined;
      if (entry.firstChild && entry.firstFilled) {
        for (const [childId, childTs] of entry.firstChild) {
          const filledTs = entry.firstFilled.get(childId);
          if (filledTs != null) {
            childToFilled.push(Math.max(0, filledTs - childTs));
            if (latestFilled == null || filledTs > latestFilled) latestFilled = filledTs;
          }
        }
      }
      if (latestFilled != null) {
        submittedToFilled.push(Math.max(0, latestFilled - entry.submitted));
      }
    }

    return {
      windowMs,
      queriedAt: now,
      sampleSize,
      stages: {
        submittedToRouted: summarise(submittedToRouted),
        routedToChild: summarise(routedToChild),
        childToFilled: summarise(childToFilled),
        submittedToFilled: summarise(submittedToFilled),
        submittedToArrived: summarise(submittedToArrived),
      },
    };
  } finally {
    client.release();
  }
}
