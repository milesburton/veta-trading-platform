import { useSignal } from "@preact/signals-react";
import type { UnknownAction } from "@reduxjs/toolkit";
import { useChannelIn } from "@veta/frontend/hooks/useChannelIn.ts";
import { useColumnLayout } from "@veta/frontend/hooks/useColumnLayout.ts";
import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { submitOrderThunk } from "@veta/frontend/store/ordersSlice.ts";
import { saveUiPrefs, setAlgoMonitorTab } from "@veta/frontend/store/uiSlice.ts";
import type { ColDef } from "@veta/frontend/types/gridPrefs.ts";
import type { ChildOrder, LiquidityFlag, OrderRecord } from "@veta/frontend/types.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";
import { formatBps } from "@veta/frontend/utils/format.ts";
import { formatPrice } from "@veta/frontend/utils/formatPrice.ts";
import { Fragment } from "react";
import { ResizableHeader } from "./grid/ResizableHeader.tsx";
import { PopOutButton } from "./PopOutButton.tsx";

const ALGO_COLS: ColDef[] = [
  { key: "asset", label: "Asset", type: "string", defaultWidth: 72 },
  {
    key: "side",
    label: "Side",
    type: "enum",
    options: ["BUY", "SELL"],
    defaultWidth: 52,
  },
  {
    key: "strategy",
    label: "Strategy",
    type: "enum",
    options: ["LIMIT", "TWAP", "POV", "VWAP"],
    defaultWidth: 72,
  },
  {
    key: "filled",
    label: "Filled",
    type: "number",
    defaultWidth: 72,
    align: "right",
  },
  {
    key: "unfilled",
    label: "Unfilled",
    type: "number",
    defaultWidth: 72,
    align: "right",
  },
  {
    key: "total",
    label: "Total",
    type: "number",
    defaultWidth: 72,
    align: "right",
  },
  { key: "progress", label: "Progress", type: "number", defaultWidth: 112 },
  {
    key: "limitPrice",
    label: "Limit",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  {
    key: "lastPrice",
    label: "Last",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  {
    key: "impact",
    label: "Impact",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
  {
    key: "commission",
    label: "Comm",
    type: "number",
    defaultWidth: 64,
    align: "right",
  },
];

type ViewTab = "active" | "needs-action" | "history";

interface TradePerf {
  avgFillPx: number;
  arrivalPx: number;
  marketImpactBps: number;
  marketImpactUSD: number;
  totalCommission: number;
  fillRate: number;
  sliceCount: number;
  makerPct: number;
  takerPct: number;
  crossPct: number;
}

function computePerf(order: OrderRecord): TradePerf | null {
  const filled = order.children.filter((c) => c.status === "filled" && c.filled > 0);
  if (filled.length === 0) return null;

  const totalFilled = filled.reduce((s, c) => s + c.filled, 0);
  const totalValue = filled.reduce((s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled, 0);
  const avgFillPx = totalFilled > 0 ? totalValue / totalFilled : 0;
  const arrivalPx = order.limitPrice;

  const rawImpact =
    order.side === "BUY"
      ? (avgFillPx - arrivalPx) / arrivalPx
      : (arrivalPx - avgFillPx) / arrivalPx;
  const marketImpactBps = rawImpact * 10_000;
  const marketImpactUSD = (avgFillPx - arrivalPx) * totalFilled * (order.side === "BUY" ? 1 : -1);

  const totalCommission = filled.reduce((s, c) => s + (c.commissionUSD ?? 0), 0);

  const countByFlag = (flag: LiquidityFlag) =>
    filled.filter((c) => c.liquidityFlag === flag).reduce((s, c) => s + c.filled, 0);
  const makerQty = countByFlag("MAKER");
  const takerQty = countByFlag("TAKER");
  const crossQty = countByFlag("CROSS");

  return {
    avgFillPx,
    arrivalPx,
    marketImpactBps,
    marketImpactUSD,
    totalCommission,
    fillRate: order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0,
    sliceCount: filled.length,
    makerPct: totalFilled > 0 ? (makerQty / totalFilled) * 100 : 0,
    takerPct: totalFilled > 0 ? (takerQty / totalFilled) * 100 : 0,
    crossPct: totalFilled > 0 ? (crossQty / totalFilled) * 100 : 0,
  };
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  const colour = clamped >= 100 ? "bg-emerald-500" : clamped >= 50 ? "bg-sky-500" : "bg-amber-500";
  return (
    <div className="w-full bg-panel rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${colour}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function formatQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1);
}

const LIQ_STYLES: Record<LiquidityFlag, string> = {
  MAKER: "text-emerald-500",
  TAKER: "text-amber-500",
  CROSS: "text-sky-500",
};

function PerfCard({ perf, order }: { perf: TradePerf; order: OrderRecord }) {
  const impactColor =
    perf.marketImpactBps > 5
      ? "text-red-400"
      : perf.marketImpactBps < -2
        ? "text-emerald-400"
        : "text-default";
  const commColor = perf.totalCommission < 0 ? "text-emerald-400" : "text-amber-400";

  return (
    <div className="bg-surface/60 border border-divider/60 rounded mx-3 my-1 p-2 grid grid-cols-4 gap-x-4 gap-y-1.5 text-[10px]">
      <div>
        <div className="text-muted uppercase tracking-wide">Avg Fill</div>
        <div className="text-secondary tabular-nums font-mono">{perf.avgFillPx.toFixed(4)}</div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Arrival Px</div>
        <div className="text-default tabular-nums font-mono">{perf.arrivalPx.toFixed(4)}</div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Mkt Impact</div>
        <div className={`tabular-nums font-semibold ${impactColor}`}>
          {formatBps(perf.marketImpactBps)}
        </div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Impact $</div>
        <div className={`tabular-nums ${impactColor}`}>
          {perf.marketImpactUSD >= 0 ? "+" : ""}${perf.marketImpactUSD.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Fill Rate</div>
        <div className="text-secondary tabular-nums">{perf.fillRate.toFixed(1)}%</div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Slices</div>
        <div className="text-secondary tabular-nums">{perf.sliceCount}</div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Commission</div>
        <div className={`tabular-nums font-semibold ${commColor}`}>
          {perf.totalCommission < 0 ? "" : "+"}${perf.totalCommission.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="text-muted uppercase tracking-wide">Side</div>
        <div
          className={`font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
        >
          {order.side}
        </div>
      </div>
      <div className="col-span-4 flex items-center gap-3 pt-0.5">
        <span className="text-muted uppercase tracking-wide">Liquidity:</span>
        <span className={LIQ_STYLES.MAKER}>MAKER {perf.makerPct.toFixed(0)}%</span>
        <span className={LIQ_STYLES.TAKER}>TAKER {perf.takerPct.toFixed(0)}%</span>
        {perf.crossPct > 0 && (
          <span className={LIQ_STYLES.CROSS}>CROSS {perf.crossPct.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

function ChildRows({ rows, asset }: { rows: ChildOrder[]; asset: string }) {
  return (
    <>
      {rows.map((c) => (
        <tr key={c.id} className="bg-surface/30 border-b border-panel/20">
          <td className="pl-8 pr-3 py-1 text-muted font-mono tabular-nums whitespace-nowrap">
            {formatUtcTime(c.submittedAt)}
          </td>
          <td
            className={`px-3 py-1 text-[10px] font-semibold ${
              c.side === "BUY" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {c.side}
          </td>
          <td className="px-3 py-1 text-muted">{asset}</td>
          <td className="px-3 py-1 text-right tabular-nums text-emerald-500">
            {formatQty(c.filled)}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-label">
            {(c.avgFillPrice ?? c.limitPrice).toFixed(4)}
          </td>
          <td
            className={`px-3 py-1 text-[10px] font-semibold ${
              c.liquidityFlag ? LIQ_STYLES[c.liquidityFlag] : "text-subtle"
            }`}
          >
            {c.liquidityFlag ?? "—"}
          </td>
          <td className="px-3 py-1 text-muted font-mono text-[10px]">
            {c.venue ? <span className="bg-panel rounded px-1">{c.venue}</span> : "—"}
          </td>
          <td className="px-3 py-1 text-muted font-mono text-[10px]">{c.counterparty ?? "—"}</td>
          <td className="px-3 py-1 text-right tabular-nums text-muted text-[10px]">
            {c.commissionUSD !== undefined ? (
              <span className={c.commissionUSD < 0 ? "text-emerald-600" : "text-amber-600"}>
                ${c.commissionUSD.toFixed(2)}
              </span>
            ) : (
              "—"
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function TradeAtLastButton({
  order,
  marketPrice,
}: {
  order: OrderRecord;
  marketPrice: number | undefined;
}) {
  const dispatch = useAppDispatch();
  const remaining = order.quantity - order.filled;

  if (remaining <= 0 || !marketPrice) return null;

  function handleTradeAtLast() {
    dispatch(
      submitOrderThunk({
        asset: order.asset,
        side: order.side,
        quantity: remaining,
        limitPrice: marketPrice as number,
        expiresAt: 60,
        algoParams: { strategy: "LIMIT" },
      })
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleTradeAtLast();
      }}
      data-testid="trade-at-last-btn"
      className="px-2 py-0.5 text-[10px] font-semibold rounded border border-amber-600/60 text-amber-400 hover:bg-amber-900/30 transition-colors whitespace-nowrap"
      title={`Submit LIMIT order for ${formatQty(remaining)} @ ${formatPrice(order.asset, marketPrice)}`}
    >
      Trade at Last
    </button>
  );
}

export function AlgoMonitor() {
  const orders = useAppSelector((s) => s.orders.orders);
  const prices = useAppSelector((s) => s.market.prices);
  const dispatch = useAppDispatch();
  const tab = useAppSelector((s) => s.ui.algoMonitorTab);
  const channelIn = useChannelIn();
  const linkedOrderId = channelIn.selectedOrderId;
  const stratFilter = useSignal("ALL");
  const expandedPerf = useSignal<Set<string>>(new Set());
  const dragKey = useSignal<string | null>(null);

  function setTab(value: ViewTab) {
    dispatch(setAlgoMonitorTab(value));
    dispatch(saveUiPrefs() as unknown as UnknownAction);
  }
  const { orderedCols, getWidth, onResize, onReorder } = useColumnLayout("algoMonitor", ALGO_COLS);

  function togglePerf(id: string) {
    const next = new Set(expandedPerf.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedPerf.value = next;
  }

  const filterStrat = (o: OrderRecord) =>
    stratFilter.value === "ALL" || o.strategy === stratFilter.value;

  const activeOrders = orders.filter(
    (o) => (o.status === "pending" || o.status === "working") && filterStrat(o)
  );

  const needsActionOrders = orders.filter(
    (o) =>
      o.filled < o.quantity &&
      (o.status === "expired" ||
        (o.status === "working" && o.filled === 0 && Date.now() - o.submittedAt > 30_000)) &&
      filterStrat(o)
  );

  const historyOrders = orders.filter(
    (o) => (o.status === "filled" || o.status === "expired") && filterStrat(o)
  );

  const displayed =
    tab === "active" ? activeOrders : tab === "needs-action" ? needsActionOrders : historyOrders;

  const isNeedsAction = tab === "needs-action";
  const colSpan = orderedCols.length + (isNeedsAction ? 1 : 0);

  return (
    <div className="flex flex-col h-full" data-testid="algo-monitor-panel">
      <div className="px-3 py-1.5 border-b border-panel flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden border border-divider text-[11px]">
            <button
              type="button"
              title="Orders currently pending or working"
              aria-pressed={tab === "active"}
              onClick={() => setTab("active")}
              data-testid="active-tab"
              className={`px-2.5 py-1 transition-colors ${
                tab === "active" ? "bg-sky-900/60 text-sky-300" : "text-muted hover:text-default"
              }`}
            >
              Active
              {activeOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-sky-800/60 text-sky-400 rounded px-1">
                  {activeOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              title="Expired or stalled orders with unfilled quantity that may need manual intervention"
              aria-pressed={tab === "needs-action"}
              onClick={() => setTab("needs-action")}
              data-testid="needs-action-tab"
              className={`px-2.5 py-1 transition-colors ${
                tab === "needs-action"
                  ? "bg-amber-900/60 text-amber-300"
                  : "text-muted hover:text-default"
              }`}
            >
              Needs Action
              {needsActionOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-amber-800/60 text-amber-400 rounded px-1">
                  {needsActionOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              title="Completed orders — filled or expired. Click a row to view execution performance."
              aria-pressed={tab === "history"}
              onClick={() => setTab("history")}
              data-testid="history-tab"
              className={`px-2.5 py-1 transition-colors ${
                tab === "history" ? "bg-divider/80 text-secondary" : "text-muted hover:text-default"
              }`}
            >
              History
              {historyOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-divider text-label rounded px-1">
                  {historyOrders.length}
                </span>
              )}
            </button>
          </div>
          <select
            aria-label="Filter by strategy"
            title="Show only orders using this execution strategy"
            value={stratFilter.value}
            onChange={(e) => {
              stratFilter.value = e.target.value;
            }}
            className="bg-panel text-xs text-default rounded px-2 py-0.5 border border-divider"
          >
            <option value="ALL">All</option>
            <option value="LIMIT">Limit</option>
            <option value="TWAP">TWAP</option>
            <option value="POV">POV</option>
            <option value="VWAP">VWAP</option>
          </select>
        </div>
        <PopOutButton panelId="algo-monitor" />
      </div>

      <div className="min-h-0 overflow-auto flex-1">
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted text-xs">
            {tab === "active"
              ? "No active algo orders"
              : tab === "needs-action"
                ? "No orders need attention"
                : "No completed orders yet"}
          </div>
        ) : (
          <table className="w-full text-xs" data-testid="algo-orders-table">
            <thead>
              <tr className="text-muted border-b border-panel sticky top-0 bg-page">
                {orderedCols.map((col) => (
                  <ResizableHeader
                    key={col.key}
                    colKey={col.key}
                    width={getWidth(col.key)}
                    minWidth={col.minWidth}
                    gridId="algoMonitor"
                    onResize={onResize}
                    onColumnDragStart={(k) => {
                      dragKey.value = k;
                    }}
                    onColumnDrop={(target) => {
                      if (dragKey.value) onReorder(dragKey.value, target);
                      dragKey.value = null;
                    }}
                    align={col.align}
                    className={`px-3 py-2 ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                  </ResizableHeader>
                ))}
                {isNeedsAction && <th className="px-3 py-2 w-24" />}
              </tr>
            </thead>
            <tbody>
              {displayed.map((order) => {
                const pct = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
                const unfilled = order.quantity - order.filled;
                const secsLeft = Math.max(0, Math.round((order.expiresAt - Date.now()) / 1_000));
                const marketPrice = prices[order.asset];
                const isLinked = linkedOrderId !== null && linkedOrderId === order.id;
                const isExpanded = expandedPerf.value.has(order.id);
                const perf = computePerf(order);

                return (
                  <Fragment key={order.id}>
                    <tr
                      onClick={() => togglePerf(order.id)}
                      data-testid={`algo-order-row-${order.id}`}
                      className={`border-b border-panel/40 cursor-pointer transition-colors ${
                        isLinked
                          ? "bg-sky-900/20 border-l-2 border-l-sky-500"
                          : isNeedsAction
                            ? "bg-amber-950/10 hover:bg-amber-900/10"
                            : "hover:bg-panel/20"
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold text-secondary">{order.asset}</td>
                      <td
                        className={`px-3 py-2 font-semibold ${
                          order.side === "BUY" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {order.side}
                      </td>
                      <td className="px-3 py-2 text-label">{order.strategy}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                        {formatQty(order.filled)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                        {unfilled > 0 ? (
                          formatQty(unfilled)
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-default">
                        {formatQty(order.quantity)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={pct} />
                          <span className="text-muted tabular-nums w-10 text-right shrink-0">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-label">
                        {formatPrice(order.asset, order.limitPrice)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          marketPrice !== undefined
                            ? (order.side === "BUY" && marketPrice <= order.limitPrice) ||
                              (order.side === "SELL" && marketPrice >= order.limitPrice)
                              ? "text-emerald-400"
                              : "text-label"
                            : "text-subtle"
                        }`}
                      >
                        {marketPrice !== undefined ? formatPrice(order.asset, marketPrice) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums text-[10px] ${
                          perf
                            ? perf.marketImpactBps > 5
                              ? "text-red-400"
                              : perf.marketImpactBps < -2
                                ? "text-emerald-400"
                                : "text-label"
                            : "text-subtle"
                        }`}
                      >
                        {perf ? formatBps(perf.marketImpactBps) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums text-[10px] ${
                          perf
                            ? perf.totalCommission < 0
                              ? "text-emerald-500"
                              : "text-amber-500"
                            : "text-subtle"
                        }`}
                      >
                        {perf ? `$${perf.totalCommission.toFixed(2)}` : "—"}
                      </td>
                      {isNeedsAction && (
                        <td className="px-3 py-2">
                          <TradeAtLastButton order={order} marketPrice={marketPrice} />
                        </td>
                      )}
                    </tr>

                    {isExpanded && (
                      <tr key={`${order.id}-expanded`}>
                        <td colSpan={colSpan} className="p-0">
                          {perf && <PerfCard perf={perf} order={order} />}
                          {order.children.length > 0 && (
                            <div className="mx-3 mb-2">
                              <div className="text-[10px] text-subtle uppercase tracking-wide px-1 pb-0.5">
                                Executions ({order.children.length})
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-subtle border-b border-panel/40">
                                    <th className="text-left pl-8 pr-3 py-1">Time</th>
                                    <th className="text-left px-3 py-1">Side</th>
                                    <th className="text-left px-3 py-1">Asset</th>
                                    <th className="text-right px-3 py-1">Filled</th>
                                    <th className="text-right px-3 py-1">Fill Px</th>
                                    <th className="text-left px-3 py-1">Liq</th>
                                    <th className="text-left px-3 py-1">Venue</th>
                                    <th className="text-left px-3 py-1">Cpty</th>
                                    <th className="text-right px-3 py-1">Comm</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <ChildRows rows={order.children} asset={order.asset} />
                                </tbody>
                              </table>
                            </div>
                          )}
                          {order.children.length === 0 && !perf && (
                            <div className="text-subtle text-[10px] px-4 py-2">
                              No executions yet
                            </div>
                          )}
                        </td>
                      </tr>
                    )}

                    {!isExpanded && (
                      <tr key={`${order.id}-state`} className="border-b border-panel/20">
                        <td colSpan={colSpan} className="px-3 py-0.5 text-[10px] text-subtle">
                          {order.status === "pending" ? (
                            <span className="text-amber-600">
                              Pending — waiting for fill conditions
                            </span>
                          ) : order.status === "expired" ? (
                            <span className="text-muted">
                              Expired —{" "}
                              {order.filled > 0
                                ? `${formatQty(order.filled)} of ${formatQty(
                                    order.quantity
                                  )} filled`
                                : "no fills"}
                            </span>
                          ) : order.status === "filled" ? (
                            <span className="text-emerald-700">
                              Filled — click to view performance
                            </span>
                          ) : (
                            <span className="text-sky-700">
                              {order.strategy === "LIMIT"
                                ? "Monitoring market"
                                : `${secsLeft}s remaining · click to inspect`}
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
