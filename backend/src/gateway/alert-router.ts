import { OrderKillAuditSchema, OrderResumeAuditSchema } from "../schemas/orders.ts";
import type { ServiceStatusEntry } from "./service-status.ts";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface OperatorAlert {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail?: string;
}

export interface AlertRouterOptions {
  deliver: (text: string) => Promise<unknown>;
  now?: () => number;
  repeatMs?: number;
}

export interface AlertRouter {
  raise: (alert: OperatorAlert) => void;
  resolve: (key: string, title: string) => void;
  notify: (alert: OperatorAlert) => void;
  isActive: (key: string) => boolean;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  CRITICAL: "🚨",
  WARNING: "⚠️",
  INFO: "ℹ️",
};

const DEFAULT_REPEAT_MS = 30 * 60_000;

export function formatAlert(alert: OperatorAlert): string {
  const head = `${SEVERITY_EMOJI[alert.severity]} **${alert.severity}** ${alert.title}`;
  return alert.detail ? `${head}\n> ${alert.detail}` : head;
}

export function createAlertRouter(options: AlertRouterOptions): AlertRouter {
  const now = options.now ?? Date.now;
  const repeatMs = options.repeatMs ?? DEFAULT_REPEAT_MS;
  const lastSent = new Map<string, number>();

  const send = (text: string): void => {
    void options.deliver(text).catch(() => undefined);
  };

  return {
    raise: (alert) => {
      const at = now();
      const previous = lastSent.get(alert.key);
      if (previous !== undefined && at - previous < repeatMs) return;
      lastSent.set(alert.key, at);
      send(formatAlert(alert));
    },
    resolve: (key, title) => {
      if (!lastSent.delete(key)) return;
      send(formatAlert({ key, severity: "INFO", title: `Recovered: ${title}` }));
    },
    notify: (alert) => send(formatAlert(alert)),
    isActive: (key) => lastSent.has(key),
  };
}

export interface ServiceWatch {
  observe: (entries: readonly ServiceStatusEntry[]) => void;
}

export function createServiceWatch(
  router: AlertRouter,
  failureThreshold: number,
  graceMs: number = 0,
  now: () => number = Date.now
): ServiceWatch {
  const consecutiveFailures = new Map<string, number>();
  const startedAt = now();

  return {
    observe: (entries) => {
      for (const entry of entries) {
        if (entry.optional) continue;
        const key = `service:${entry.id}`;
        if (entry.status === "error") {
          const failures = (consecutiveFailures.get(entry.id) ?? 0) + 1;
          consecutiveFailures.set(entry.id, failures);
          if (failures >= failureThreshold && now() - startedAt >= graceMs) {
            router.raise({
              key,
              severity: "CRITICAL",
              title: `${entry.name} is offline`,
              detail: `${failures} consecutive failed health checks`,
            });
          }
        } else {
          consecutiveFailures.delete(entry.id);
          router.resolve(key, `${entry.name} is healthy again`);
        }
      }
    },
  };
}

export interface RejectionWatch {
  record: (event: unknown, at?: number) => void;
  evaluate: (at?: number) => void;
}

interface RejectionSample {
  at: number;
  reason: string;
}

function reasonOf(event: unknown): string {
  const reason = (event as { reason?: unknown } | null)?.reason;
  return typeof reason === "string" && reason.length > 0 ? reason : "unspecified";
}

function topReason(samples: readonly RejectionSample[]): string {
  const counts = samples.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }),
    {}
  );
  const [top] = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return top ? `${top[0]} (${top[1]})` : "unspecified";
}

const MAX_REJECTION_SAMPLES = 5_000;

export function createRejectionWatch(
  router: AlertRouter,
  windowMs: number,
  threshold: number,
  now: () => number = Date.now
): RejectionWatch {
  const samples: RejectionSample[] = [];
  const key = "order-rejections";

  const prune = (at: number): void => {
    const firstLive = samples.findIndex((s) => at - s.at < windowMs);
    samples.splice(0, firstLive === -1 ? samples.length : firstLive);
  };

  const evaluate = (at: number = now()): void => {
    prune(at);
    if (samples.length >= threshold) {
      router.raise({
        key,
        severity: "WARNING",
        title: `${samples.length} order rejections in the last ${Math.round(windowMs / 1000)}s`,
        detail: `Most common reason: ${topReason(samples)}`,
      });
    } else {
      router.resolve(key, "order rejection rate is back to normal");
    }
  };

  return {
    record: (event, at = now()) => {
      samples.push({ at, reason: reasonOf(event) });
      if (samples.length > MAX_REJECTION_SAMPLES) samples.shift();
      if (samples.length >= threshold && !router.isActive(key)) evaluate(at);
    },
    evaluate,
  };
}

function describeScope(event: { scope: string; scopeValue?: string; targetUserId?: string }) {
  const target = event.scopeValue ?? event.targetUserId;
  return target ? `${event.scope} ${target}` : event.scope;
}

export function routeKillSwitchEvent(router: AlertRouter, topic: string, raw: unknown): void {
  if (topic === "orders.kill.audit") {
    const parsed = OrderKillAuditSchema.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    router.notify({
      key: "kill-switch",
      severity: "CRITICAL",
      title: `Kill switch engaged: ${describeScope(event)}`,
      detail: `Issued by ${event.issuedBy} (${event.issuedByRole}); ${event.cancelledCount} orders cancelled`,
    });
    return;
  }
  if (topic === "orders.resume.audit") {
    const parsed = OrderResumeAuditSchema.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    router.notify({
      key: "kill-switch",
      severity: "INFO",
      title: `Trading resumed: ${describeScope(event)}`,
      detail: `Issued by ${event.issuedBy} (${event.issuedByRole})`,
    });
  }
}
