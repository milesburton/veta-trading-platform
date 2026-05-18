import { useSignal } from "@preact/signals-react";
import type { AlertSeverity, AlertSource } from "@veta/frontend/store/alertsSlice.ts";
import { allAlertsDismissed, selectActiveAlerts } from "@veta/frontend/store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { AlertList } from "./AlertDrawer.tsx";

type Filter = "ALL" | AlertSeverity;

export function AlertsPanel() {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectActiveAlerts);
  const filter = useSignal<Filter>("ALL");
  const sourceFilter = useSignal<AlertSource | null>(null);

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs" data-testid="alerts-panel">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Alert Centre
        </span>
        {alerts.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch(allAlertsDismissed())}
            data-testid="dismiss-all-btn"
            className="text-[11px] text-muted hover:text-default transition-colors"
          >
            Dismiss all
          </button>
        )}
      </div>
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
    </div>
  );
}
