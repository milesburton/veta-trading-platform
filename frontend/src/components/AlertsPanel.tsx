import { useState } from "react";
import type { AlertSeverity } from "../store/alertsSlice.ts";
import { allAlertsDismissed, selectActiveAlerts } from "../store/alertsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { AlertList } from "./AlertDrawer.tsx";

type Filter = "ALL" | AlertSeverity;

export function AlertsPanel() {
  const dispatch = useAppDispatch();
  const alerts = useAppSelector(selectActiveAlerts);
  const [filter, setFilter] = useState<Filter>("ALL");

  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs"
      data-testid="alerts-panel"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Alert Centre
        </span>
        {alerts.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch(allAlertsDismissed())}
            data-testid="dismiss-all-btn"
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Dismiss all
          </button>
        )}
      </div>
      <AlertList alerts={alerts} filter={filter} onFilter={setFilter} />
    </div>
  );
}
