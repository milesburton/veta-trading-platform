import { useSignal } from "@preact/signals-react";
import type { Alert, AlertSeverity } from "../store/alertsSlice.ts";
import { alertDismissed, allAlertsDismissed, selectActiveAlerts } from "../store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { useDashboard } from "./dashboard/DashboardContext.tsx";

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SEVERITY_STYLES: Record<AlertSeverity, { dot: string; badge: string; label: string }> = {
  CRITICAL: {
    dot: "bg-red-500",
    badge: "bg-red-900/60 text-red-300 border border-red-800",
    label: "CRITICAL",
  },
  WARNING: {
    dot: "bg-amber-400",
    badge: "bg-amber-900/60 text-amber-300 border border-amber-800",
    label: "WARNING",
  },
  INFO: {
    dot: "bg-blue-400",
    badge: "bg-blue-900/40 text-blue-300 border border-blue-800",
    label: "INFO",
  },
};

const SOURCE_LABELS: Record<Alert["source"], string> = {
  "kill-switch": "Kill Switch",
  service: "Service",
  algo: "Algo",
  order: "Order",
  workspace: "Workspace",
};

type Filter = "ALL" | AlertSeverity;

export function AlertList({
  alerts,
  filter,
  onFilter,
}: {
  alerts: Alert[];
  filter: Filter;
  onFilter: (f: Filter) => void;
}) {
  const dispatch = useAppDispatch();
  const filtered = filter === "ALL" ? alerts : alerts.filter((a) => a.severity === filter);

  return (
    <>
      <div className="flex gap-1.5 px-4 py-2 border-b border-gray-800 shrink-0">
        {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilter(f)}
            data-testid={`severity-filter-${f}`}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
              filter === f ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600 text-sm">
            <span className="text-2xl">✓</span>
            <span>No alerts</span>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800 list-none m-0 p-0">
            {filtered.map((alert) => {
              const s = SEVERITY_STYLES[alert.severity];
              return (
                <li
                  key={alert.id}
                  className="flex items-start gap-3 px-4 py-3"
                  data-testid="alert-row"
                >
                  <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${s.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${s.badge}`}
                      >
                        {s.label}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {SOURCE_LABELS[alert.source]}
                      </span>
                    </div>
                    <div className="text-[12px] text-gray-200">{alert.message}</div>
                    {alert.detail && (
                      <div className="text-[11px] text-gray-500 mt-0.5">{alert.detail}</div>
                    )}
                    <div className="text-[10px] text-gray-600 mt-0.5">{relativeTime(alert.ts)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch(alertDismissed(alert.id))}
                    className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors text-sm leading-none mt-0.5"
                    title="Dismiss"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-800 shrink-0 text-[10px] text-gray-600">
          {filtered.length === alerts.length
            ? `${alerts.length} alert${alerts.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${alerts.length}`}
        </div>
      )}
    </>
  );
}

interface Props {
  onClose: () => void;
}

export function AlertDrawer({ onClose }: Props) {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectActiveAlerts);
  const filter = useSignal<Filter>("ALL");
  const { activePanelIds, addPanel } = useDashboard();
  const isPinned = activePanelIds.has("alerts");

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drawer backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: ESC handled by close button */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed top-0 right-0 h-full w-96 z-50 flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <span className="text-sm font-semibold text-gray-200">Alert Centre</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              title={isPinned ? "Alerts panel is open in dashboard" : "Pin to dashboard"}
              onClick={() => {
                if (!isPinned) {
                  addPanel("alerts");
                  onClose();
                }
              }}
              className={`flex items-center justify-center w-5 h-5 rounded transition-colors ${
                isPinned ? "text-amber-400 cursor-default" : "text-gray-600 hover:text-gray-300"
              }`}
              style={{ fontSize: "11px", lineHeight: 1 }}
            >
              {isPinned ? "◈" : "◇"}
            </button>
            {alerts.length > 0 && (
              <button
                type="button"
                onClick={() => dispatch(allAlertsDismissed())}
                className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                Dismiss all
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <AlertList
          alerts={alerts}
          filter={filter.value}
          onFilter={(f) => {
            filter.value = f;
          }}
        />
      </div>
    </>
  );
}
