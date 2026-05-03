import { type DataDepthSymbol, useGetDataDepthQuery } from "../../store/servicesApi.ts";
import { Drawer } from "./Drawer.tsx";

export const DATA_DEPTH_DRAWER_ID = "data-depth";

const GOOD_DAYS = 7;
const LIMITED_DAYS = 1;

function categoryFor(spanDays: number): "good" | "limited" | "poor" {
  if (spanDays >= GOOD_DAYS) return "good";
  if (spanDays >= LIMITED_DAYS) return "limited";
  return "poor";
}

function colourFor(category: "good" | "limited" | "poor"): { dot: string; text: string } {
  if (category === "good") return { dot: "bg-emerald-500", text: "text-emerald-400" };
  if (category === "limited") return { dot: "bg-amber-400", text: "text-amber-400" };
  return { dot: "bg-red-500", text: "text-red-400" };
}

function formatSpan(spanDays: number): string {
  if (spanDays >= 1) return `${Math.round(spanDays * 10) / 10}d`;
  if (spanDays > 0) return `${Math.round(spanDays * 24)}h`;
  return "none";
}

function compareWorstFirst(a: DataDepthSymbol, b: DataDepthSymbol): number {
  if (a.spanDays !== b.spanDays) return a.spanDays - b.spanDays;
  return a.instrument.localeCompare(b.instrument);
}

export function DataDepthDrawer() {
  const { data, isLoading, isError, refetch } = useGetDataDepthQuery(undefined, {
    pollingInterval: 30_000,
  });

  return (
    <Drawer id={DATA_DEPTH_DRAWER_ID} title="Market Data Depth">
      {isLoading && <div className="p-4 text-xs text-gray-500">Loading…</div>}

      {isError && (
        <div className="p-4 space-y-2">
          <div className="text-xs text-red-400">Failed to load data depth.</div>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-[11px] text-gray-400 hover:text-gray-200 underline"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div data-testid="data-depth-drawer-content">
          <div className="px-4 py-3 border-b border-gray-800 grid grid-cols-3 gap-3 text-[11px]">
            <Stat label="Symbols" value={String(data.totalSymbols)} />
            <Stat label="Avg" value={formatSpan(data.avgDays)} />
            <Stat label="Min" value={formatSpan(data.minDays)} />
          </div>

          {data.minDays < GOOD_DAYS && (
            <div className="px-4 py-2 text-[11px] text-amber-400 border-b border-amber-900/40 bg-amber-950/20">
              {data.minDays < LIMITED_DAYS
                ? "Scenario analysis and volatility estimates are unreliable."
                : "Analytics accuracy is limited with less than 7 days of market data."}
            </div>
          )}

          <ul className="divide-y divide-gray-800/60">
            {[...data.symbols].sort(compareWorstFirst).map((sym) => {
              const category = categoryFor(sym.spanDays);
              const colour = colourFor(category);
              return (
                <li
                  key={sym.instrument}
                  data-testid={`data-depth-row-${sym.instrument}`}
                  className="flex items-center justify-between gap-3 px-4 py-1.5 text-[11px] tabular-nums"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colour.dot}`} />
                    <span className="text-gray-200 truncate">{sym.instrument}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-500 shrink-0">
                    <span>{sym.candleCount} candles</span>
                    <span className={colour.text}>{formatSpan(sym.spanDays)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-gray-500 uppercase tracking-wider text-[9px]">{label}</div>
      <div className="text-gray-100 font-medium">{value}</div>
    </div>
  );
}
