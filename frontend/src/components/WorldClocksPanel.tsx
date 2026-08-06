import { useSignal } from "@preact/signals-react";
import {
  FINANCIAL_CENTERS,
  formatCenterDate,
  formatCenterTime,
  isCenterOpen,
} from "@veta/frontend/domain/market/financial-centers";
import { useEffect } from "react";

export function WorldClocksPanel() {
  const now = useSignal(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      now.value = new Date();
    }, 1000);
    return () => clearInterval(id);
  }, [now]);

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      <div className="px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          World Clocks
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        <div className="grid grid-cols-1 gap-2">
          {FINANCIAL_CENTERS.map((center) => {
            const open = isCenterOpen(center, now.value);
            return (
              <div
                key={center.id}
                data-testid={`clock-${center.id}`}
                className="flex items-center justify-between rounded border border-panel/60 bg-panel/20 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-secondary">{center.label}</span>
                  <span className="text-muted text-[10px]">
                    {formatCenterDate(center, now.value)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="tabular-nums text-sm font-semibold text-default">
                    {formatCenterTime(center, now.value)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      open
                        ? "bg-emerald-900/40 text-emerald-400 border border-emerald-700/50"
                        : "bg-panel/60 text-muted border border-divider/40"
                    }`}
                  >
                    {open ? "Open" : "Closed"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
