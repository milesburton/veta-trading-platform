import { CORS_HEADERS, corsOptions, json } from "@veta/http";
import { logger } from "@veta/logger";
import { createTypedConsumer } from "@veta/messaging";
import { NewsSignalSchema, type NewsSignal } from "@veta/schemas/news";
import {
  classifyOrder,
  completeHeartbeat,
  expiredEvent,
  type ProgressReader,
  type TrackedOrder,
} from "./fill-progress.ts";

const FORCED_KILL_AFTER_MS = 10_000;

export function spawnKillWatchdog(pid: number, afterMs: number): void {
  try {
    new Deno.Command("sh", {
      args: ["-c", `sleep ${afterMs / 1000}; kill -9 ${pid}`],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    })
      .spawn()
      .unref();
  } catch (err) {
    logger.warn("Could not spawn exit watchdog", { err });
  }
}

const exitWithWatchdog = (code: number): void => {
  spawnKillWatchdog(Deno.pid, FORCED_KILL_AFTER_MS);
  Deno.exit(code);
};

// isQuiescent() must reflect zero pending/active orders — never exit owing a fill.
export function armAlgoIdleExit(
  timeoutMs: number,
  isQuiescent: () => boolean,
  label: string,
  options: { checkIntervalMs?: number; exit?: (code: number) => void } = {}
): { touch: () => void; checkNow: () => void; stop: () => void } {
  const checkIntervalMs = options.checkIntervalMs ?? 5_000;
  const exit = options.exit ?? exitWithWatchdog;
  let lastActivity = Date.now();
  const touch = () => {
    lastActivity = Date.now();
  };
  const checkNow = () => {
    if (!isQuiescent()) return;
    if (Date.now() - lastActivity < timeoutMs) return;
    logger.info(`[${label}] Idle timeout reached with no pending orders — exiting`);
    exit(0);
  };
  const intervalId = setInterval(checkNow, checkIntervalMs);
  const stop = () => clearInterval(intervalId);
  return { touch, checkNow, stop };
}

export function serveAlgoHealth(
  port: number,
  service: string,
  version: string,
  getActiveOrders: () => number
): void {
  Deno.serve({ port }, (req) => {
    if (req.method === "OPTIONS") return corsOptions();

    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") {
      return json({ service, version, status: "ok", activeOrders: getActiveOrders() });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  });
}

interface ExpirableOrder {
  orderId: string;
  clientOrderId?: string;
  expiresAt: number;
  filledQty: number;
  costBasis: number;
}

export function startExpirySweep<T extends ExpirableOrder>(
  activeOrders: Map<string, T>,
  producer: { send: (topic: string, msg: unknown) => Promise<void> } | null,
  algo: string,
  label: string
): void {
  setInterval(async () => {
    const now = Date.now();
    for (const order of [...activeOrders.values()]) {
      if (now >= order.expiresAt) {
        const avgFill = order.filledQty > 0 ? order.costBasis / order.filledQty : 0;
        logger.info(`[${label}] Expiry sweep: ${order.orderId} filled=${order.filledQty}`);
        activeOrders.delete(order.orderId);
        await producer
          ?.send("orders.expired", {
            orderId: order.orderId,
            clientOrderId: order.clientOrderId,
            algo,
            filledQty: order.filledQty,
            avgFillPrice: order.filledQty > 0 ? avgFill : 0,
            ts: now,
          })
          .catch(() => {});
      }
    }
  }, 5_000);
}

export function startJournalProgressSweep<K, T extends TrackedOrder>(
  activeOrders: Map<K, T>,
  readProgress: ProgressReader,
  producer: { send: (topic: string, msg: unknown) => Promise<void> } | null,
  algo: string,
  label: string,
  intervalMs = 5_000
): void {
  const sweep = async () => {
    for (const [key, order] of [...activeOrders.entries()]) {
      const now = Date.now();
      const progress = await readProgress(order.orderId);
      const outcome = classifyOrder(order, progress, now);
      if (outcome === "working") continue;
      activeOrders.delete(key);
      if (outcome === "complete" && progress) {
        logger.info(`[${label}] Complete ${order.orderId}: filled=${progress.filledQty}`);
        await producer
          ?.send("algo.heartbeat", completeHeartbeat(order, algo, progress, now))
          .catch(() => {});
        continue;
      }
      logger.info(`[${label}] Expired ${order.orderId}: filled=${progress?.filledQty ?? "unknown"}`);
      await producer?.send("orders.expired", expiredEvent(order, algo, progress, now)).catch(() => {});
    }
  };
  const schedule = (): void => {
    setTimeout(() => {
      sweep()
        .catch((err) => logger.warn(`[${label}] Progress sweep failed`, { err }))
        .finally(schedule);
    }, intervalMs);
  };
  schedule();
}

export function subscribeNewsSignals(groupId: string, label: string): void {
  createTypedConsumer(groupId, [
    {
      topic: "news.signal",
      schema: NewsSignalSchema,
      handler: (sig: NewsSignal) => {
        logger.info(`[${label}] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`);
      },
    },
  ]).catch(() => {});
}
