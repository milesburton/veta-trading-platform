import { DataDepthList } from "./drawers/DataDepthDrawer.tsx";

export function DataDepthPanel() {
  return (
    <div
      className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs overflow-y-auto"
      data-testid="data-depth-panel"
    >
      <div className="flex items-center px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Market Data Depth
        </span>
      </div>
      <DataDepthList />
    </div>
  );
}
