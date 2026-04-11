import { useAppSelector } from "../store/hooks.ts";
import { type RiskPosition, useGetUserPositionsQuery } from "../store/riskApi.ts";
import { PopOutButton } from "./PopOutButton.tsx";

function pnlColor(pnl: number): string {
  if (pnl > 0) return "text-emerald-400";
  if (pnl < 0) return "text-red-400";
  return "text-gray-500";
}

function formatCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

function PositionRow({ pos }: { pos: RiskPosition }) {
  return (
    <tr className="border-t border-gray-800/50 hover:bg-gray-800/20 transition-colors">
      <td className="px-3 py-2 text-gray-200 font-medium">{pos.symbol}</td>
      <td
        className={`px-3 py-2 tabular-nums ${pos.netQty > 0 ? "text-emerald-400" : pos.netQty < 0 ? "text-red-400" : "text-gray-500"}`}
      >
        {pos.netQty > 0 ? "+" : ""}
        {pos.netQty.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-400">{pos.avgPrice.toFixed(2)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
        {pos.markPrice.toFixed(2)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${pnlColor(pos.unrealisedPnl)}`}>
        ${formatCurrency(pos.unrealisedPnl)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${pnlColor(pos.realisedPnl)}`}>
        ${formatCurrency(pos.realisedPnl)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${pnlColor(pos.totalPnl)}`}>
        ${formatCurrency(pos.totalPnl)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pos.fillCount}</td>
    </tr>
  );
}

export function MyPositionsPanel() {
  const userId = useAppSelector((s) => s.auth.user?.id);
  const { data, isLoading } = useGetUserPositionsQuery(userId ?? "", {
    skip: !userId,
    pollingInterval: 2_000,
  });

  const positions = data?.positions ?? [];
  const totalUnrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const totalRealised = positions.reduce((s, p) => s + p.realisedPnl, 0);
  const totalPnl = totalUnrealised + totalRealised;
  const grossNotional = positions.reduce((s, p) => s + Math.abs(p.netQty * p.markPrice), 0);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-gray-400 font-medium uppercase tracking-wider">My Positions</span>
        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-gray-500">Gross ${formatCurrency(grossNotional)}</span>
              <span className={pnlColor(totalPnl)}>P&L ${formatCurrency(totalPnl)}</span>
            </div>
          )}
          <PopOutButton panelId="my-positions" />
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>
      )}

      {!isLoading && positions.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No open positions — submit and fill orders to build a book.
        </div>
      )}

      {positions.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur">
              <tr className="text-gray-500 text-left text-[10px] uppercase tracking-wider">
                <th className="px-3 py-1.5">Symbol</th>
                <th className="px-3 py-1.5">Position</th>
                <th className="px-3 py-1.5 text-right">Avg Price</th>
                <th className="px-3 py-1.5 text-right">Mark</th>
                <th className="px-3 py-1.5 text-right">Unreal</th>
                <th className="px-3 py-1.5 text-right">Real</th>
                <th className="px-3 py-1.5 text-right">Total P&L</th>
                <th className="px-3 py-1.5 text-right">Fills</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <PositionRow key={p.symbol} pos={p} />
              ))}
              <tr className="border-t border-gray-700 bg-gray-900/40">
                <td className="px-3 py-2 font-medium text-gray-300">Total</td>
                <td />
                <td />
                <td />
                <td
                  className={`px-3 py-2 text-right tabular-nums font-medium ${pnlColor(totalUnrealised)}`}
                >
                  ${formatCurrency(totalUnrealised)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums font-medium ${pnlColor(totalRealised)}`}
                >
                  ${formatCurrency(totalRealised)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-bold ${pnlColor(totalPnl)}`}>
                  ${formatCurrency(totalPnl)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {positions.reduce((s, p) => s + p.fillCount, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
