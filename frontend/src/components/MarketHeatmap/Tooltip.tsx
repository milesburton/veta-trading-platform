import type { AssetDef } from "@veta/frontend/types.ts";

export interface TooltipPosition {
  left: number;
  top: number;
  width: number;
}

export function tooltipPosition(
  mouseX: number,
  mouseY: number,
  containerWidth: number,
  containerHeight: number,
  width: number,
  height: number,
  offset = 12
): TooltipPosition {
  const left = mouseX + offset + width > containerWidth ? mouseX - width - offset : mouseX + offset;
  const top =
    mouseY + offset + height > containerHeight ? mouseY - height - offset : mouseY + offset;
  return { left, top, width };
}

export interface OtherTooltipData {
  sector: string;
  otherCount: number;
  pct: number;
}

export function OtherTooltip({
  position,
  data,
}: {
  position: TooltipPosition;
  data: OtherTooltipData;
}) {
  return (
    <div
      className="absolute bg-surface/95 border border-divider rounded shadow-xl px-3 py-2 text-[11px] pointer-events-none z-10"
      style={{ left: position.left, top: position.top, width: position.width }}
      aria-live="polite"
    >
      <div className="font-bold text-primary text-sm mb-0.5">{data.sector} — Other</div>
      <div className="text-label text-[10px] mb-1">
        {data.otherCount} stocks too small to display
      </div>
      <div
        className={`font-semibold text-[10px] ${
          data.pct >= 0 ? "text-emerald-400" : "text-red-400"
        }`}
      >
        Avg {data.pct >= 0 ? "+" : ""}
        {data.pct.toFixed(2)}%
      </div>
      <div className="text-subtle text-[9px] mt-1.5 border-t border-panel pt-1">
        Click to zoom in →
      </div>
    </div>
  );
}

export interface SymbolTooltipData {
  asset: AssetDef;
  pct: number;
  price: number;
}

export function SymbolTooltip({
  position,
  data,
}: {
  position: TooltipPosition;
  data: SymbolTooltipData;
}) {
  const { asset, pct, price } = data;
  const capB = asset.marketCapB;
  return (
    <div
      className="absolute bg-surface/95 border border-divider rounded shadow-xl px-3 py-2 text-[11px] pointer-events-none z-10"
      style={{ left: position.left, top: position.top, width: position.width }}
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-bold text-primary text-sm">{asset.symbol}</span>
        <span className={`font-bold text-sm ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      </div>
      <div className="text-muted text-[10px] mb-2">{asset.sector}</div>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between">
          <span className="text-muted">Price</span>
          <span className="text-secondary tabular-nums">${price.toFixed(2)}</span>
        </div>
        {capB != null && (
          <div className="flex justify-between">
            <span className="text-muted">Mkt Cap</span>
            <span className="text-secondary tabular-nums">
              {capB >= 1000 ? `$${(capB / 1000).toFixed(1)}T` : `$${capB.toFixed(0)}B`}
            </span>
          </div>
        )}
        {asset.beta != null && (
          <div className="flex justify-between">
            <span className="text-muted">Beta</span>
            <span className="text-secondary tabular-nums">{asset.beta.toFixed(2)}</span>
          </div>
        )}
        {asset.peRatio != null && (
          <div className="flex justify-between">
            <span className="text-muted">P/E</span>
            <span className="text-secondary tabular-nums">{asset.peRatio.toFixed(1)}x</span>
          </div>
        )}
        {asset.dividendYield != null && asset.dividendYield > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">Div Yield</span>
            <span className="text-secondary tabular-nums">{asset.dividendYield.toFixed(2)}%</span>
          </div>
        )}
        {asset.dailyVolume != null && (
          <div className="flex justify-between">
            <span className="text-muted">Volume</span>
            <span className="text-secondary tabular-nums">
              {asset.dailyVolume >= 1e6
                ? `${(asset.dailyVolume / 1e6).toFixed(1)}M`
                : `${(asset.dailyVolume / 1e3).toFixed(0)}K`}
            </span>
          </div>
        )}
      </div>
      <div className="text-subtle text-[9px] mt-1.5 border-t border-panel pt-1">
        Click to broadcast →
      </div>
    </div>
  );
}
