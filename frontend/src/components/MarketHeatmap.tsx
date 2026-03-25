import { useSignal } from "@preact/signals-react";
import { useEffect, useMemo, useRef } from "react";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppSelector } from "../store/hooks.ts";
import { COLOR } from "../tokens.ts";
import type { AssetDef } from "../types.ts";

function pctToColor(pct: number): string {
  if (pct >= 4) return COLOR.HEAT_STRONG_UP;
  if (pct >= 2) return COLOR.HEAT_MID_UP;
  if (pct >= 1) return COLOR.HEAT_UP;
  if (pct >= 0.25) return COLOR.HEAT_LIGHT_UP;
  if (pct > 0) return COLOR.HEAT_FAINT_UP;
  if (pct === 0) return COLOR.HEAT_NEUTRAL;
  if (pct > -0.25) return COLOR.HEAT_FAINT_DOWN;
  if (pct > -1) return COLOR.HEAT_DOWN;
  if (pct > -2) return COLOR.HEAT_MID_DOWN;
  if (pct > -4) return COLOR.HEAT_STRONG_DOWN;
  return COLOR.HEAT_DEEP_DOWN;
}

function tileTextColor(pct: number): string {
  if (pct >= 0.25 && pct < 1) return COLOR.HEAT_TEXT_LIGHT_UP;
  if (pct > -0.25 && pct < 0) return COLOR.HEAT_TEXT_LIGHT_DOWN;
  return COLOR.HEAT_TEXT_DEFAULT;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TileData {
  symbol: string;
  sector: string;
  pct: number;
  size: number;
  isOther?: boolean;
  otherCount?: number;
}
interface LayoutTile extends TileData, Rect {}

function squarify(items: TileData[], bounds: Rect): LayoutTile[] {
  if (items.length === 0 || bounds.w <= 0 || bounds.h <= 0) return [];
  const total = items.reduce((s, d) => s + d.size, 0);
  if (total <= 0) return [];

  const result: LayoutTile[] = [];
  let remaining = [...items];
  let { x, y, w, h } = bounds;
  const area = bounds.w * bounds.h;

  function worst(row: TileData[], sideLen: number): number {
    const s = row.reduce((acc, d) => acc + d.size, 0);
    const s2 = s * s;
    const sideLen2 = sideLen * sideLen;
    let max = 0;
    for (const d of row) {
      const a = (d.size / total) * area;
      const r1 = (sideLen2 * d.size) / s2;
      const r2 = s2 / (sideLen2 * d.size);
      const ratio = Math.max(r1, r2, a > 0 ? 1 / a : Infinity);
      if (ratio > max) max = ratio;
    }
    return max;
  }

  function layoutRow(
    row: TileData[],
    x0: number,
    y0: number,
    w0: number,
    h0: number,
    horiz: boolean
  ) {
    const rowSum = row.reduce((s, d) => s + d.size, 0);
    const stripW = horiz ? ((rowSum / total) * area) / h0 : ((rowSum / total) * area) / w0;
    let cursor = 0;
    for (const item of row) {
      const frac = item.size / rowSum;
      if (horiz) {
        result.push({ ...item, x: x0, y: y0 + cursor, w: stripW, h: frac * h0 });
        cursor += frac * h0;
      } else {
        result.push({ ...item, x: x0 + cursor, y: y0, w: frac * w0, h: stripW });
        cursor += frac * w0;
      }
    }
    return stripW;
  }

  while (remaining.length > 0) {
    const horiz = w >= h;
    const sideLen = horiz ? h : w;
    let row: TileData[] = [];
    let i = 0;
    while (i < remaining.length) {
      const next = [...row, remaining[i]];
      if (row.length === 0 || worst(next, sideLen) <= worst(row, sideLen)) {
        row = next;
        i++;
      } else break;
    }
    if (row.length === 0) row = [remaining[0]];
    const stripW = layoutRow(row, x, y, w, h, horiz);
    remaining = remaining.slice(row.length);
    if (horiz) {
      x += stripW;
      w -= stripW;
    } else {
      y += stripW;
      h -= stripW;
    }
  }
  return result;
}

function collapseSmallTiles(items: TileData[], bounds: Rect, sector: string): TileData[] {
  if (items.length === 0) return [];
  const layout = squarify(items, bounds);
  const MIN_PX = 18;
  const visible: TileData[] = [];
  const collapsed: TileData[] = [];
  for (const lt of layout) {
    const item = items.find((it) => it.symbol === lt.symbol);
    if (!item) continue;
    if (lt.w - 2 >= MIN_PX && lt.h - 2 >= MIN_PX) {
      visible.push(item);
    } else {
      collapsed.push(item);
    }
  }
  if (collapsed.length === 0) return items;
  const otherSize = collapsed.reduce((s, d) => s + d.size, 0);
  const otherPct =
    otherSize > 0 ? collapsed.reduce((s, d) => s + d.pct * d.size, 0) / otherSize : 0;
  const other: TileData = {
    symbol: `${sector}:OTHER`,
    sector,
    pct: otherPct,
    size: otherSize,
    isOther: true,
    otherCount: collapsed.length,
  };
  return [...visible, other];
}

const SECTOR_GAP = 4;
const LABEL_H = 16;
const MIN_TILE_SIZE = 32;

interface TooltipState {
  symbol: string;
  mouseX: number;
  mouseY: number;
}

export function MarketHeatmap() {
  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const priceHistory = useAppSelector((s) => s.market.priceHistory);
  const broadcast = useChannelOut();

  const tooltip = useSignal<TooltipState | null>(null);
  const sortBy = useSignal<"cap" | "change">("cap");
  const drilldown = useSignal<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasW = useSignal(960);
  const canvasH = useSignal(540);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0) canvasW.value = Math.floor(width);
      if (height > 0) canvasH.value = Math.floor(height);
    });
    ro.observe(el);
    canvasW.value = el.clientWidth || 960;
    canvasH.value = el.clientHeight || 540;
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasH, canvasW]);

  const tiles = useMemo<TileData[]>(() => {
    return assets.map((a: AssetDef) => {
      const price = prices[a.symbol] ?? a.initialPrice;
      const history = priceHistory[a.symbol] ?? [];
      const open = history[0] ?? a.initialPrice;
      const pct = open > 0 ? ((price - open) / open) * 100 : 0;
      const size = sortBy.value === "cap" ? (a.marketCapB ?? 1) : Math.max(Math.abs(pct), 0.1);
      return { symbol: a.symbol, sector: a.sector, pct, size };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, prices, priceHistory, sortBy.value]);

  const sectors = useMemo(() => {
    const map = new Map<string, TileData[]>();
    for (const t of tiles) {
      if (!map.has(t.sector)) map.set(t.sector, []);
      map.get(t.sector)?.push(t);
    }
    return Array.from(map.entries())
      .map(([sector, items]) => {
        const totalSize = items.reduce((s, d) => s + d.size, 0);
        const sectorPct =
          totalSize > 0 ? items.reduce((s, d) => s + d.pct * d.size, 0) / totalSize : 0;
        return { sector, items: [...items].sort((a, b) => b.size - a.size), totalSize, sectorPct };
      })
      .sort((a, b) => b.totalSize - a.totalSize);
  }, [tiles]);

  const cw = canvasW.value;
  const rawH = canvasH.value;

  const isDrilled = drilldown.value !== null;
  const drilledSector = isDrilled ? sectors.find((s) => s.sector === drilldown.value) : null;

  const ch = isDrilled
    ? Math.max(
        rawH,
        Math.ceil(
          (MIN_TILE_SIZE * MIN_TILE_SIZE * (drilledSector?.items.length ?? 1)) / Math.max(cw, 1)
        )
      )
    : (() => {
        const totalTiles = sectors.reduce((s, sec) => s + sec.items.length, 0);
        const minH =
          totalTiles > 0
            ? Math.ceil((MIN_TILE_SIZE * MIN_TILE_SIZE * totalTiles) / Math.max(cw, 1))
            : rawH;
        return Math.max(rawH, minH);
      })();

  const sectorLayout = isDrilled
    ? null
    : squarify(
        sectors.map((s) => ({
          symbol: s.sector,
          sector: s.sector,
          pct: s.sectorPct,
          size: s.totalSize,
        })),
        { x: 0, y: 0, w: cw, h: ch }
      );

  const sectorBlocks = isDrilled
    ? null
    : sectors.map((s, i) => {
        const sRect = sectorLayout?.[i];
        if (!sRect)
          return {
            ...s,
            sRect: { x: 0, y: 0, w: 0, h: 0 },
            hasLabel: false,
            layoutTiles: [] as LayoutTile[],
          };
        const hasLabel = sRect.w > 40 && sRect.h > LABEL_H + 8;
        const inner: Rect = {
          x: sRect.x + SECTOR_GAP,
          y: sRect.y + SECTOR_GAP + (hasLabel ? LABEL_H : 0),
          w: Math.max(sRect.w - SECTOR_GAP * 2, 1),
          h: Math.max(sRect.h - SECTOR_GAP * 2 - (hasLabel ? LABEL_H : 0), 1),
        };
        const collapsed = collapseSmallTiles(s.items, inner, s.sector);
        return { ...s, sRect, hasLabel, layoutTiles: squarify(collapsed, inner) };
      });

  const drilledLayout =
    isDrilled && drilledSector ? squarify(drilledSector.items, { x: 0, y: 0, w: cw, h: ch }) : null;

  const tooltipSymbolRaw = tooltip.value?.symbol ?? null;
  const tooltipSymbol = tooltipSymbolRaw?.includes(":OTHER") ? null : tooltipSymbolRaw;
  const tooltipAsset = tooltipSymbol
    ? assets.find((a: AssetDef) => a.symbol === tooltipSymbol)
    : null;
  const tooltipTile = tooltipSymbol ? tiles.find((t) => t.symbol === tooltipSymbol) : null;

  function handleTileMouseEvent(e: React.MouseEvent, symbol: string) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    tooltip.value = {
      symbol,
      mouseX: e.clientX - rect.left,
      mouseY: e.clientY - rect.top + wrap.scrollTop,
    };
  }

  function renderTile(tile: LayoutTile, onClickOther?: (sector: string) => void) {
    const isHovered = tooltip.value?.symbol === tile.symbol;
    const color = pctToColor(tile.pct);
    const textClr = tileTextColor(tile.pct);
    const tx = tile.x + 1;
    const ty = tile.y + 1;
    const tw = Math.max(tile.w - 2, 1);
    const th = Math.max(tile.h - 2, 1);
    const midX = tx + tw / 2;
    const midY = ty + th / 2;

    if (tile.isOther) {
      const showLabel = tw > 24 && th > 12;
      return (
        // biome-ignore lint/a11y/useSemanticElements: SVG <g> cannot be replaced by <button>
        <g
          key={tile.symbol}
          onClick={() => onClickOther?.(tile.sector)}
          onMouseEnter={(e) => handleTileMouseEvent(e, tile.symbol)}
          onMouseMove={(e) => handleTileMouseEvent(e, tile.symbol)}
          onMouseLeave={() => {
            tooltip.value = null;
          }}
          style={{ cursor: "zoom-in" }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onClickOther?.(tile.sector);
          }}
          aria-label={`${tile.otherCount} more stocks in ${tile.sector} — click to expand`}
        >
          <rect
            x={tx}
            y={ty}
            width={tw}
            height={th}
            fill={color}
            stroke={isHovered ? "#ffffff" : COLOR.HEAT_BG}
            strokeWidth={isHovered ? 1.5 : 0.5}
            strokeDasharray="3 2"
            rx={1}
          />
          {showLabel && (
            <text
              x={midX}
              y={midY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.min(tw / 5, 10)}
              fontWeight="600"
              style={{ pointerEvents: "none", fill: COLOR.HEAT_TEXT_DEFAULT }}
            >
              +{tile.otherCount}
            </text>
          )}
        </g>
      );
    }

    const showSymbol = tw > 20 && th > 10;
    const showPct = tw > 26 && th > 22;
    const large = tw > 60 && th > 40;
    const symFontSize = large ? Math.min(tw / 4.5, 18) : Math.min(tw / 5, 11);
    const pctFontSize = large ? 10 : 7;
    const symY = showPct ? midY - (large ? 7 : 4) : midY + symFontSize * 0.35;
    const pctY = midY + (large ? 10 : 6);

    return (
      // biome-ignore lint/a11y/useSemanticElements: SVG <g> cannot be replaced by <button>
      <g
        key={tile.symbol}
        data-testid={`heatmap-cell-${tile.symbol}`}
        onClick={() => broadcast({ selectedAsset: tile.symbol })}
        onMouseEnter={(e) => handleTileMouseEvent(e, tile.symbol)}
        onMouseMove={(e) => handleTileMouseEvent(e, tile.symbol)}
        onMouseLeave={() => {
          tooltip.value = null;
        }}
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") broadcast({ selectedAsset: tile.symbol });
        }}
        aria-label={`${tile.symbol}: ${tile.pct >= 0 ? "+" : ""}${tile.pct.toFixed(2)}%`}
      >
        <rect
          x={tx}
          y={ty}
          width={tw}
          height={th}
          fill={color}
          stroke={isHovered ? "#ffffff" : COLOR.HEAT_BG}
          strokeWidth={isHovered ? 1.5 : 0.5}
          rx={1}
        />
        {showSymbol && (
          <text
            x={midX}
            y={symY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={symFontSize}
            fontWeight="700"
            style={{ pointerEvents: "none", fill: textClr }}
          >
            {tile.symbol}
          </text>
        )}
        {showPct && (
          <text
            x={midX}
            y={pctY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={pctFontSize}
            fontWeight="400"
            style={{ pointerEvents: "none", fill: textClr }}
          >
            {tile.pct >= 0 ? "+" : ""}
            {tile.pct.toFixed(2)}%
          </text>
        )}
      </g>
    );
  }

  return (
    <div
      data-testid="market-heatmap-panel"
      className="flex flex-col h-full bg-[#0d1117] text-gray-100 select-none"
    >
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-3 shrink-0 text-[11px]">
        {isDrilled ? (
          <>
            <button
              type="button"
              onClick={() => {
                drilldown.value = null;
                tooltip.value = null;
              }}
              className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Back to full market view"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M8 2L4 6L8 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="uppercase tracking-wider">All Sectors</span>
            </button>
            <span className="text-gray-700">/</span>
            <span className="font-semibold text-gray-200 uppercase tracking-wider">
              {drilldown.value}
            </span>
            <span className="text-gray-600 text-[9px] ml-1">
              ({drilledSector?.items.length} stocks)
            </span>
          </>
        ) : (
          <span className="font-semibold text-gray-400 uppercase tracking-wider">
            Market Heatmap
          </span>
        )}
        {!isDrilled && (
          <div className="flex rounded border border-gray-700 overflow-hidden text-[10px] ml-2">
            {(["cap", "change"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  sortBy.value = mode;
                }}
                aria-pressed={sortBy.value === mode}
                className={`px-2 py-0.5 transition-colors ${sortBy.value === mode ? "bg-gray-700 text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
              >
                {mode === "cap" ? "By Cap" : "By Move"}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2 text-[9px] text-gray-500">
          {([-4, -2, -0.5, 0, 0.5, 2, 4] as const).map((v) => (
            <span key={v} className="flex items-center gap-0.5">
              <span
                className="inline-block w-3 h-2.5 rounded-sm"
                style={{ background: pctToColor(v) }}
              />
              <span>{v > 0 ? `+${v}` : v}%</span>
            </span>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="flex-1 overflow-y-auto overflow-x-hidden relative bg-[#0d1117]">
        <svg
          width="100%"
          height={ch}
          viewBox={`0 0 ${cw} ${ch}`}
          preserveAspectRatio="none"
          aria-label={
            isDrilled
              ? `${drilldown.value} sector heatmap`
              : "Market heatmap — sector treemap coloured by % price change"
          }
          role="img"
        >
          <rect x={0} y={0} width={cw} height={ch} fill={COLOR.HEAT_BG} />

          {isDrilled && drilledLayout
            ? drilledLayout.map((tile) => renderTile(tile))
            : sectorBlocks?.map((block, si) => {
                const sRect = sectorLayout?.[si];
                if (!sRect || sRect.w < 8 || sRect.h < 8) return null;
                return (
                  <g key={block.sector}>
                    <rect
                      x={sRect.x}
                      y={sRect.y}
                      width={sRect.w}
                      height={sRect.h}
                      fill={COLOR.HEAT_BG}
                    />
                    {block.hasLabel && (
                      <>
                        <rect
                          x={sRect.x + SECTOR_GAP}
                          y={sRect.y + SECTOR_GAP}
                          width={sRect.w - SECTOR_GAP * 2}
                          height={LABEL_H}
                          fill={COLOR.HEAT_SECTOR_BG}
                          rx={2}
                        />
                        <text
                          x={sRect.x + SECTOR_GAP + 5}
                          y={sRect.y + SECTOR_GAP + LABEL_H / 2 + 1}
                          fontSize={Math.min(10, (sRect.w - SECTOR_GAP * 2) / 10)}
                          fontWeight="600"
                          dominantBaseline="middle"
                          style={{
                            pointerEvents: "none",
                            letterSpacing: "0.05em",
                            fill: COLOR.HEAT_SECTOR_LABEL,
                          }}
                        >
                          {sRect.w > 120
                            ? block.sector.toUpperCase()
                            : block.sector
                                .slice(0, Math.max(Math.floor((sRect.w - SECTOR_GAP * 2) / 8), 3))
                                .toUpperCase()}
                        </text>
                      </>
                    )}
                    {block.layoutTiles.map((tile) =>
                      renderTile(tile, (sector) => {
                        drilldown.value = sector;
                        tooltip.value = null;
                      })
                    )}
                  </g>
                );
              })}
        </svg>

        {tooltip.value &&
          (() => {
            const { mouseX, mouseY, symbol } = tooltip.value;

            if (symbol.includes(":OTHER")) {
              const sector = symbol.split(":")[0];
              const otherTile = (sectorBlocks ?? [])
                .flatMap((b) => b.layoutTiles)
                .find((t) => t.symbol === symbol);
              if (!otherTile) return null;
              const TOOLTIP_W = 148;
              const TOOLTIP_H = 64;
              const OFFSET = 12;
              const left =
                mouseX + OFFSET + TOOLTIP_W > cw ? mouseX - TOOLTIP_W - OFFSET : mouseX + OFFSET;
              const top =
                mouseY + OFFSET + TOOLTIP_H > ch ? mouseY - TOOLTIP_H - OFFSET : mouseY + OFFSET;
              return (
                <div
                  className="absolute bg-gray-900/95 border border-gray-700 rounded shadow-xl px-3 py-2 text-[11px] pointer-events-none z-10"
                  style={{ left, top, width: TOOLTIP_W }}
                  aria-live="polite"
                >
                  <div className="font-bold text-gray-100 text-sm mb-0.5">{sector} — Other</div>
                  <div className="text-gray-400 text-[10px] mb-1">
                    {otherTile.otherCount} stocks too small to display
                  </div>
                  <div
                    className={`font-semibold text-[10px] ${otherTile.pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    Avg {otherTile.pct >= 0 ? "+" : ""}
                    {otherTile.pct.toFixed(2)}%
                  </div>
                  <div className="text-gray-600 text-[9px] mt-1.5 border-t border-gray-800 pt-1">
                    Click to zoom in →
                  </div>
                </div>
              );
            }

            if (!tooltipTile || !tooltipAsset) return null;
            const price = prices[tooltipAsset.symbol] ?? tooltipAsset.initialPrice;
            const capB = tooltipAsset.marketCapB;
            const TOOLTIP_W = 160;
            const TOOLTIP_H = 130;
            const OFFSET = 12;
            const left =
              mouseX + OFFSET + TOOLTIP_W > cw ? mouseX - TOOLTIP_W - OFFSET : mouseX + OFFSET;
            const top =
              mouseY + OFFSET + TOOLTIP_H > ch ? mouseY - TOOLTIP_H - OFFSET : mouseY + OFFSET;
            return (
              <div
                className="absolute bg-gray-900/95 border border-gray-700 rounded shadow-xl px-3 py-2 text-[11px] pointer-events-none z-10"
                style={{ left, top, width: TOOLTIP_W }}
                aria-live="polite"
              >
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-bold text-gray-100 text-sm">{tooltipAsset.symbol}</span>
                  <span
                    className={`font-bold text-sm ${tooltipTile.pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {tooltipTile.pct >= 0 ? "+" : ""}
                    {tooltipTile.pct.toFixed(2)}%
                  </span>
                </div>
                <div className="text-gray-500 text-[10px] mb-2">{tooltipAsset.sector}</div>
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price</span>
                    <span className="text-gray-200 tabular-nums">${price.toFixed(2)}</span>
                  </div>
                  {capB != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mkt Cap</span>
                      <span className="text-gray-200 tabular-nums">
                        {capB >= 1000 ? `$${(capB / 1000).toFixed(1)}T` : `$${capB.toFixed(0)}B`}
                      </span>
                    </div>
                  )}
                  {tooltipAsset.beta != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Beta</span>
                      <span className="text-gray-200 tabular-nums">
                        {tooltipAsset.beta.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {tooltipAsset.peRatio != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">P/E</span>
                      <span className="text-gray-200 tabular-nums">
                        {tooltipAsset.peRatio.toFixed(1)}x
                      </span>
                    </div>
                  )}
                  {tooltipAsset.dividendYield != null && tooltipAsset.dividendYield > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Div Yield</span>
                      <span className="text-gray-200 tabular-nums">
                        {tooltipAsset.dividendYield.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {tooltipAsset.dailyVolume != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Volume</span>
                      <span className="text-gray-200 tabular-nums">
                        {tooltipAsset.dailyVolume >= 1e6
                          ? `${(tooltipAsset.dailyVolume / 1e6).toFixed(1)}M`
                          : `${(tooltipAsset.dailyVolume / 1e3).toFixed(0)}K`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-gray-600 text-[9px] mt-1.5 border-t border-gray-800 pt-1">
                  Click to broadcast →
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}
