import { useSignal } from "@preact/signals-react";
import { useCallback, useEffect, useMemo } from "react";
import {
  type Alert as AlertType,
  alertAcknowledged,
  alertDismissed,
  selectToastQueue,
} from "../store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { ALERTS_DRAWER_ID } from "./AlertDrawer.tsx";
import { useDrawers } from "./drawers/DrawersContext.tsx";

const AUTO_DISMISS_MS = 8_000;

const SEVERITY_STYLES = {
  CRITICAL: {
    accent: "border-red-500/70 ring-red-500/30",
    badge: "bg-red-900/60 text-red-300 border-red-700/60",
    label: "Critical",
  },
  WARNING: {
    accent: "border-amber-600/70 ring-amber-600/30",
    badge: "bg-amber-900/60 text-amber-300 border-amber-700/60",
    label: "Warning",
  },
  INFO: {
    accent: "border-sky-600/70 ring-sky-600/30",
    badge: "bg-sky-900/60 text-sky-300 border-sky-700/60",
    label: "Info",
  },
} as const;

const SOURCE_LABELS: Record<string, string> = {
  "kill-switch": "Kill switch",
  service: "Service",
  algo: "Algo",
  order: "Order",
  workspace: "Workspace",
};

function relativeTime(ms: number | undefined): string {
  if (ms === undefined) return "—";
  const delta = Date.now() - ms;
  if (delta < 0) return "just now";
  const s = Math.floor(delta / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function AlertToast() {
  const dispatch = useAppDispatch();
  const queue = useAppSelector(selectToastQueue);
  const { open: openDrawer, isOpen } = useDrawers();
  const drawerOpen = isOpen(ALERTS_DRAWER_ID);

  // Index into the queue. We render queue[index].
  // The queue updates as alerts are dispatched/acknowledged, so we
  // clamp the index whenever the queue length changes.
  const index = useSignal(0);

  const queueLength = queue.length;
  const safeIndex = Math.min(index.value, Math.max(0, queueLength - 1));
  const current: AlertType | undefined = queue[safeIndex];
  const total = queueLength;
  const hasPrev = safeIndex < total - 1;
  const hasNext = safeIndex > 0;

  const onAcknowledge = useCallback(() => {
    if (!current) return;
    dispatch(alertAcknowledged(current.id));
    index.value = 0;
  }, [current, dispatch, index]);

  const onDismiss = useCallback(() => {
    if (!current) return;
    dispatch(alertDismissed(current.id));
    index.value = 0;
  }, [current, dispatch, index]);

  const onPrev = useCallback(() => {
    if (hasPrev) index.value = safeIndex + 1;
  }, [hasPrev, index, safeIndex]);

  const onNext = useCallback(() => {
    if (hasNext) index.value = safeIndex - 1;
  }, [hasNext, index, safeIndex]);

  const onViewAll = useCallback(() => {
    dispatch(alertAcknowledged(current?.id ?? ""));
    openDrawer(ALERTS_DRAWER_ID);
  }, [current, dispatch, openDrawer]);

  // Auto-dismiss INFO/WARNING after AUTO_DISMISS_MS, but only if
  // no toast newer than `current` is already in the queue.
  // CRITICAL alerts persist until explicitly acknowledged.
  const currentId = current?.id;
  const currentSeverity = current?.severity;
  useEffect(() => {
    if (!currentId || currentSeverity === "CRITICAL") return;
    const t = setTimeout(() => {
      dispatch(alertAcknowledged(currentId));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [currentId, currentSeverity, dispatch]);

  const causedBy = useMemo(() => (current ? formatCausedBy(current) : null), [current]);

  if (drawerOpen || !current) return null;

  const styles = SEVERITY_STYLES[current.severity];
  const sourceLabel = SOURCE_LABELS[current.source] ?? current.source;

  return (
    <output
      data-testid="alert-toast"
      aria-live="polite"
      className={`fixed bottom-4 right-4 z-[120] w-[22rem] rounded-lg border bg-surface shadow-2xl ring-1 ${styles.accent}`}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border ${styles.badge}`}
          >
            {styles.label}
          </span>
          <span className="text-[10px] text-muted">{sourceLabel}</span>
          {(current.count ?? 1) > 1 && (
            <span
              className="text-[10px] font-mono font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded px-1 leading-none py-0.5"
              title={`${current.count} occurrences in this run`}
            >
              ×{(current.count ?? 1) > 99 ? "99+" : current.count}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-muted hover:text-secondary transition-colors text-base leading-none -mt-0.5"
          aria-label="Dismiss alert"
          data-testid="alert-toast-dismiss"
        >
          ×
        </button>
      </div>

      <div className="px-3 pb-3 pt-1.5">
        <div className="text-[12px] text-primary leading-snug">{current.message}</div>
        {current.detail && (
          <div className="mt-1 text-[11px] text-label leading-snug">{current.detail}</div>
        )}
        {causedBy && <div className="mt-1.5 text-[10px] text-muted font-mono">{causedBy}</div>}
        <div className="mt-1.5 text-[10px] text-subtle">
          {(current.count ?? 1) > 1
            ? `last ${relativeTime(current.lastTs ?? current.ts)} · first ${relativeTime(current.ts)}`
            : relativeTime(current.ts)}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-panel px-2 py-1.5 text-[10px] text-muted">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="px-1.5 py-0.5 rounded hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Older alert"
            data-testid="alert-toast-prev"
          >
            ‹
          </button>
          <span className="tabular-nums" data-testid="alert-toast-position">
            {total === 0 ? "0/0" : `${safeIndex + 1}/${total}`}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="px-1.5 py-0.5 rounded hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Newer alert"
            data-testid="alert-toast-next"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAcknowledge}
            className="px-2 py-0.5 rounded text-default hover:bg-panel transition-colors"
            data-testid="alert-toast-ack"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onViewAll}
            className="px-2 py-0.5 rounded text-amber-400 hover:bg-amber-950/40 transition-colors"
            data-testid="alert-toast-view-all"
          >
            View all
          </button>
        </div>
      </div>
    </output>
  );
}

function formatCausedBy(a: AlertType): string | null {
  const parts: string[] = [];
  if (a.relatedTopic) parts.push(`topic: ${a.relatedTopic}`);
  if (a.relatedEventId) parts.push(`event: ${a.relatedEventId}`);
  if (a.relatedAt && a.relatedAt !== a.ts) parts.push(`at: ${relativeTime(a.relatedAt)}`);
  return parts.length === 0 ? null : `caused by — ${parts.join(" · ")}`;
}
