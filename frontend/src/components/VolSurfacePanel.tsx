import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { useGetVolSurfaceQuery } from "../store/analyticsApi.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setOptionPrefill } from "../store/uiSlice.ts";
import type { VolSurfacePoint } from "../types/analytics.ts";

const MONEYNESS_LABELS: Record<number, string> = {
  0.7: "70%",
  0.775: "77.5%",
  0.85: "85%",
  0.925: "92.5%",
  1.0: "ATM",
  1.075: "107.5%",
  1.15: "115%",
  1.225: "122.5%",
  1.3: "130%",
};

const EXPIRY_LABELS = ["7d", "14d", "30d", "60d", "90d"];

function volToColor(vol: number, minVol: number, maxVol: number): string {
  const range = Math.max(0.001, maxVol - minVol);
  const t = Math.max(0, Math.min(1, (vol - minVol) / range));

  if (t < 0.5) {
    const s = t * 2;
    const r = Math.round(59 + s * (156 - 59));
    const g = Math.round(130 + s * (163 - 130));
    const b = Math.round(246 + s * (175 - 246));
    return `rgb(${r},${g},${b})`;
  }
  const s = (t - 0.5) * 2;
  const r = Math.round(156 + s * (239 - 156));
  const g = Math.round(163 + s * (68 - 163));
  const b = Math.round(175 + s * (68 - 175));
  return `rgb(${r},${g},${b})`;
}

function textColor(vol: number, minVol: number, maxVol: number): string {
  const range = Math.max(0.001, maxVol - minVol);
  const t = (vol - minVol) / range;
  return t > 0.65 || t < 0.2 ? "text-white" : "text-gray-900";
}

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ", "AMZN", "GOOGL"];

interface TooltipState {
  point: VolSurfacePoint;
  x: number;
  y: number;
}

export function VolSurfacePanel() {
  const symbol = useSignal("AAPL");
  const dispatch = useAppDispatch();
  const selectedAsset = useAppSelector((s) => s.ui.selectedAsset);

  useEffect(() => {
    if (selectedAsset && DEFAULT_SYMBOLS.includes(selectedAsset)) {
      symbol.value = selectedAsset;
    }
  }, [selectedAsset, symbol]);

  const { data, isFetching, isError } = useGetVolSurfaceQuery(symbol.value, {
    skip: !symbol.value,
    pollingInterval: 60_000,
  });

  const tooltip = useSignal<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const vols = data?.surface.map((p) => p.impliedVol) ?? [];
  const minVol = vols.length ? Math.min(...vols) : 0;
  const maxVol = vols.length ? Math.max(...vols) : 1;

  const surfaceMap = new Map<string, Map<number, VolSurfacePoint>>();
  for (const point of data?.surface ?? []) {
    if (!surfaceMap.has(point.expiryLabel)) {
      surfaceMap.set(point.expiryLabel, new Map());
    }
    // biome-ignore lint/style/noNonNullAssertion: we just set the key above
    surfaceMap.get(point.expiryLabel)!.set(point.moneyness, point);
  }

  const moneynesses = data?.moneynesses ?? [];

  function handleCellClick(point: VolSurfacePoint) {
    dispatch(setOptionPrefill({ strike: point.strike, expirySecs: point.expirySecs }));
  }

  function handleCellMouseEnter(point: VolSurfacePoint, e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      tooltip.value = {
        point,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col gap-2 overflow-hidden p-3 text-xs text-gray-100"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-200">Vol Surface · Smile + Term Structure</span>
        <div className="flex items-center gap-2">
          {isFetching && <span className="text-[10px] text-gray-500">refreshing…</span>}
          <select
            className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
            value={symbol.value}
            onChange={(e) => {
              symbol.value = e.target.value;
            }}
          >
            {DEFAULT_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span>
            Spot: <span className="text-white">${data.spotPrice.toFixed(2)}</span>
          </span>
          <span>
            ATM Vol:{" "}
            <span className="text-yellow-300">{(data.atTheMoneyVol * 100).toFixed(1)}%</span>
          </span>
          <span>
            Surface: <span className="text-gray-300">{data.surface.length} points</span>
          </span>
          <span className="ml-auto text-[9px] text-gray-600">
            click cell → pre-fills Option Pricing
          </span>
        </div>
      )}

      {isError && <p className="py-4 text-center text-red-400">Failed to load vol surface.</p>}

      {!data && !isError && !isFetching && (
        <p className="py-4 text-center text-gray-500">Loading…</p>
      )}

      {data && moneynesses.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="min-w-[340px]">
            <div className="mb-1 grid grid-cols-[56px_repeat(5,1fr)] gap-0.5">
              <div />
              {EXPIRY_LABELS.map((exp) => (
                <div key={exp} className="text-center text-[9px] font-medium text-gray-400">
                  {exp}
                </div>
              ))}
            </div>

            {[...moneynesses].reverse().map((mn) => (
              <div key={mn} className="mb-0.5 grid grid-cols-[56px_repeat(5,1fr)] gap-0.5">
                <div className="flex items-center justify-end pr-1 text-[9px] text-gray-400">
                  {MONEYNESS_LABELS[mn] ?? `${(mn * 100).toFixed(1)}%`}
                </div>
                {EXPIRY_LABELS.map((exp) => {
                  const point = surfaceMap.get(exp)?.get(mn);
                  if (!point) {
                    return <div key={exp} className="h-7 rounded bg-gray-800" />;
                  }
                  const bg = volToColor(point.impliedVol, minVol, maxVol);
                  const tc = textColor(point.impliedVol, minVol, maxVol);
                  return (
                    <button
                      key={exp}
                      type="button"
                      className={`h-7 rounded text-center text-[9px] font-mono font-semibold transition-all hover:ring-1 hover:ring-white/50 ${tc}`}
                      style={{ backgroundColor: bg }}
                      onClick={() => handleCellClick(point)}
                      onMouseEnter={(e) => handleCellMouseEnter(point, e)}
                      onMouseLeave={() => {
                        tooltip.value = null;
                      }}
                    >
                      {(point.impliedVol * 100).toFixed(1)}%
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="flex items-center gap-2 text-[9px] text-gray-500">
          <span>{(minVol * 100).toFixed(1)}%</span>
          <div
            className="h-2 flex-1 rounded"
            style={{
              background:
                "linear-gradient(to right, rgb(59,130,246), rgb(156,163,175), rgb(239,68,68))",
            }}
          />
          <span>{(maxVol * 100).toFixed(1)}%</span>
        </div>
      )}

      {tooltip.value && (
        <div
          className="pointer-events-none absolute z-50 rounded border border-gray-600 bg-gray-900 p-2 text-[10px] shadow-xl"
          style={{
            left: Math.min(tooltip.value.x + 12, (containerRef.current?.clientWidth ?? 300) - 180),
            top: Math.min(tooltip.value.y + 8, (containerRef.current?.clientHeight ?? 300) - 100),
          }}
        >
          <p className="font-semibold text-white">
            Strike: ${tooltip.value.point.strike.toFixed(2)}
          </p>
          <p className="text-gray-300">Expiry: {tooltip.value.point.expiryLabel}</p>
          <p className="text-yellow-300">
            Implied Vol: {(tooltip.value.point.impliedVol * 100).toFixed(2)}%
          </p>
          <p className="text-gray-400">
            Moneyness: {(tooltip.value.point.moneyness * 100).toFixed(1)}%
            {tooltip.value.point.moneyness === 1.0 ? " (ATM)" : ""}
          </p>
          <p className="mt-1 text-blue-400 text-[9px]">Click → pre-fill Option Pricing</p>
        </div>
      )}
    </div>
  );
}
