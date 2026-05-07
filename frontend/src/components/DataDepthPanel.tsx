import { DataDepthList } from "./drawers/DataDepthDrawer.tsx";

export function DataDepthPanel() {
  return (
    <div
      className="flex flex-col h-full bg-page text-default text-xs overflow-y-auto"
      data-testid="data-depth-panel"
    >
      <div className="flex items-center px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Market Data Depth
        </span>
      </div>
      <DataDepthList />
    </div>
  );
}
