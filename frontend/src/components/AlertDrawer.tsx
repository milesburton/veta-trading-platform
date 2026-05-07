import { useSignal } from "@preact/signals-react";
import type { Alert, AlertSeverity, AlertSource } from "../store/alertsSlice.ts";
import {
  alertDismissed,
  allAlertsDismissed,
  muteRuleAdded,
  selectActiveAlerts,
  selectMuteRules,
} from "../store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { useDashboard } from "./dashboard/DashboardContext.tsx";
import { Drawer } from "./drawers/Drawer.tsx";

export const ALERTS_DRAWER_ID = "alerts";

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const SEVERITY_STYLES: Record<AlertSeverity, { dot: string; badge: string; label: string }> =
  {
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

export const SOURCE_LABELS: Record<Alert["source"], string> = {
  "kill-switch": "Kill Switch",
  service: "Service",
  algo: "Algo",
  order: "Order",
  workspace: "Workspace",
};

const ALL_SOURCES: AlertSource[] = ["kill-switch", "service", "algo", "order", "workspace"];

type SeverityFilter = "ALL" | AlertSeverity;

export function AlertList({
  alerts,
  filter,
  onFilter,
  sourceFilter,
  onSourceFilter,
}: {
  alerts: Alert[];
  filter: SeverityFilter;
  onFilter: (f: SeverityFilter) => void;
  sourceFilter?: AlertSource | null;
  onSourceFilter?: (s: AlertSource | null) => void;
}) {
  const dispatch = useAppDispatch();
  const muteRules = useAppSelector(selectMuteRules);
  const filtered = alerts.filter((a) => {
    if (filter !== "ALL" && a.severity !== filter) return false;
    if (sourceFilter && a.source !== sourceFilter) return false;
    return true;
  });

  return (
    <>
      <div className="flex flex-col gap-1 px-4 py-2 border-b border-panel shrink-0">
        <div className="flex gap-1.5">
          {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilter(f)}
              data-testid={`severity-filter-${f}`}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                filter === f ? "bg-divider text-primary" : "text-muted hover:text-default"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {onSourceFilter && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onSourceFilter(null)}
              data-testid="source-filter-all"
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                !sourceFilter ? "bg-divider text-primary" : "text-muted hover:text-default"
              }`}
            >
              All Sources
            </button>
            {ALL_SOURCES.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => onSourceFilter(sourceFilter === src ? null : src)}
                data-testid={`source-filter-${src}`}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  sourceFilter === src ? "bg-divider text-primary" : "text-muted hover:text-default"
                }`}
              >
                {SOURCE_LABELS[src]}
              </button>
            ))}
          </div>
        )}
        {muteRules.length > 0 && (
          <div className="text-[9px] text-subtle">
            {muteRules.length} mute rule{muteRules.length !== 1 ? "s" : ""} active
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-subtle text-sm">
            <span className="text-2xl">✓</span>
            <span>No alerts</span>
          </div>
        ) : (
          <ul className="divide-y divide-panel list-none m-0 p-0">
            {filtered.map((alert) => {
              const s = SEVERITY_STYLES[alert.severity];
              return (
                <li
                  key={alert.id}
                  className="group flex items-start gap-3 px-4 py-3"
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
                      <span className="text-[10px] text-muted">{SOURCE_LABELS[alert.source]}</span>
                      {(alert.count ?? 1) > 1 && (
                        <span
                          className="text-[10px] font-mono font-semibold text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded px-1 leading-none py-0.5"
                          data-testid="alert-count"
                          title={`${alert.count} occurrences in this run`}
                        >
                          ×{(alert.count ?? 1) > 99 ? "99+" : alert.count}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-secondary">{alert.message}</div>
                    {alert.detail && (
                      <div className="text-[11px] text-muted mt-0.5">{alert.detail}</div>
                    )}
                    {(alert.relatedTopic || alert.relatedEventId) && (
                      <div
                        className="text-[10px] text-muted mt-0.5 font-mono"
                        data-testid="alert-caused-by"
                      >
                        caused by —{" "}
                        {[
                          alert.relatedTopic && `topic: ${alert.relatedTopic}`,
                          alert.relatedEventId && `event: ${alert.relatedEventId}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    <div className="text-[10px] text-subtle mt-0.5">
                      {(alert.count ?? 1) > 1
                        ? `last ${relativeTime(alert.lastTs ?? alert.ts)} · first ${relativeTime(alert.ts)}`
                        : relativeTime(alert.ts)}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 mt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        dispatch(
                          muteRuleAdded({
                            source: alert.source,
                            severity: alert.severity,
                          })
                        )
                      }
                      className="hidden group-hover:block text-subtle hover:text-amber-400 transition-colors text-[9px] leading-none"
                      title={`Mute ${alert.severity} alerts from ${SOURCE_LABELS[alert.source]}`}
                      data-testid="mute-similar-btn"
                    >
                      ◇
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(alertDismissed(alert.id))}
                      className="shrink-0 text-subtle hover:text-label transition-colors text-sm leading-none"
                      title="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="px-4 py-2 border-t border-panel shrink-0 text-[10px] text-subtle">
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
  const filter = useSignal<SeverityFilter>("ALL");
  const sourceFilter = useSignal<AlertSource | null>(null);
  const { activePanelIds, addPanel } = useDashboard();
  const isPinned = activePanelIds.has("alerts");

  const headerActions = (
    <>
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
          isPinned ? "text-amber-400 cursor-default" : "text-subtle hover:text-default"
        }`}
        style={{ fontSize: "11px", lineHeight: 1 }}
      >
        {isPinned ? "◈" : "◇"}
      </button>
      {alerts.length > 0 && (
        <button
          type="button"
          onClick={() => dispatch(allAlertsDismissed())}
          className="text-[11px] text-muted hover:text-default transition-colors"
        >
          Dismiss all
        </button>
      )}
    </>
  );

  return (
    <Drawer id={ALERTS_DRAWER_ID} title="Alert Centre" headerActions={headerActions}>
      <AlertList
        alerts={alerts}
        filter={filter.value}
        onFilter={(f) => {
          filter.value = f;
        }}
        sourceFilter={sourceFilter.value}
        onSourceFilter={(s) => {
          sourceFilter.value = s;
        }}
      />
    </Drawer>
  );
}
