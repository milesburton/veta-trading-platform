import {
  type RiskPosition,
  useGetPositionsQuery,
  useGetRiskConfigQuery,
} from "../store/riskApi.ts";
import { formatCurrency, pnlColor } from "../utils/format.ts";
import { PopOutButton } from "./PopOutButton.tsx";

function UserPositionRow({ userId, positions }: { userId: string; positions: RiskPosition[] }) {
  const totalUnrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const totalRealised = positions.reduce((s, p) => s + p.realisedPnl, 0);
  const totalPnl = totalUnrealised + totalRealised;
  const grossNotional = positions.reduce((s, p) => s + Math.abs(p.netQty * p.markPrice), 0);
  const netNotional = positions.reduce((s, p) => s + p.netQty * p.markPrice, 0);
  const fillCount = positions.reduce((s, p) => s + p.fillCount, 0);

  return (
    <>
      <tr className="border-t border-gray-800/50 bg-gray-900/30">
        <td className="px-3 py-1.5 font-medium text-gray-200" colSpan={2}>
          {userId}
          <span className="ml-2 text-gray-600 text-[10px]">
            {positions.length} symbol{positions.length !== 1 ? "s" : ""} · {fillCount} fills
          </span>
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">
          ${formatCurrency(grossNotional)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">
          ${formatCurrency(netNotional)}
        </td>
        <td className={`px-3 py-1.5 text-right tabular-nums ${pnlColor(totalUnrealised)}`}>
          ${formatCurrency(totalUnrealised)}
        </td>
        <td className={`px-3 py-1.5 text-right tabular-nums ${pnlColor(totalRealised)}`}>
          ${formatCurrency(totalRealised)}
        </td>
        <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${pnlColor(totalPnl)}`}>
          ${formatCurrency(totalPnl)}
        </td>
      </tr>
      {positions.map((p) => (
        <tr key={`${userId}-${p.symbol}`} className="border-t border-gray-800/20">
          <td className="px-3 py-1 pl-8 text-gray-500 text-[10px]" />
          <td className="px-3 py-1 text-gray-400">
            {p.symbol}
            <span
              className={`ml-2 text-[10px] ${p.netQty > 0 ? "text-emerald-600" : p.netQty < 0 ? "text-red-600" : "text-gray-600"}`}
            >
              {p.netQty > 0 ? "LONG" : p.netQty < 0 ? "SHORT" : "FLAT"}{" "}
              {Math.abs(p.netQty).toLocaleString()}
            </span>
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500 text-[10px]">
            {p.avgPrice.toFixed(2)} → {p.markPrice.toFixed(2)}
          </td>
          <td />
          <td
            className={`px-3 py-1 text-right tabular-nums text-[10px] ${pnlColor(p.unrealisedPnl)}`}
          >
            {formatCurrency(p.unrealisedPnl)}
          </td>
          <td
            className={`px-3 py-1 text-right tabular-nums text-[10px] ${pnlColor(p.realisedPnl)}`}
          >
            {formatCurrency(p.realisedPnl)}
          </td>
          <td className={`px-3 py-1 text-right tabular-nums text-[10px] ${pnlColor(p.totalPnl)}`}>
            {formatCurrency(p.totalPnl)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function RiskDashboardPanel() {
  const { data, isLoading } = useGetPositionsQuery(undefined, {
    pollingInterval: 2_000,
  });
  const { data: riskConfig } = useGetRiskConfigQuery(undefined);

  const allPositions = data?.positions ?? {};
  const userIds = Object.keys(allPositions).sort();
  const hasPositions = userIds.some((id) => allPositions[id].length > 0);

  const firmUnrealised = userIds.reduce(
    (s, id) => s + allPositions[id].reduce((a, p) => a + p.unrealisedPnl, 0),
    0
  );
  const firmRealised = userIds.reduce(
    (s, id) => s + allPositions[id].reduce((a, p) => a + p.realisedPnl, 0),
    0
  );
  const firmTotal = firmUnrealised + firmRealised;

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-gray-400 font-medium uppercase tracking-wider">Risk Dashboard</span>
          {riskConfig && (
            <span className="text-[10px] text-gray-600">
              collar {riskConfig.fatFingerPct}% · max {riskConfig.maxOpenOrders} orders ·{" "}
              {riskConfig.maxOrdersPerSecond}/s · ADV {riskConfig.maxAdvPct}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasPositions && (
            <span className={`text-sm font-medium tabular-nums ${pnlColor(firmTotal)}`}>
              Firm P&L: ${formatCurrency(firmTotal)}
            </span>
          )}
          <PopOutButton panelId="risk-dashboard" />
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>
      )}

      {!isLoading && !hasPositions && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No positions — orders have not yet been filled.
        </div>
      )}

      {hasPositions && (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur">
              <tr className="text-gray-500 text-left text-[10px] uppercase tracking-wider">
                <th className="px-3 py-1.5" />
                <th className="px-3 py-1.5">Symbol</th>
                <th className="px-3 py-1.5 text-right">Gross</th>
                <th className="px-3 py-1.5 text-right">Net</th>
                <th className="px-3 py-1.5 text-right">Unreal P&L</th>
                <th className="px-3 py-1.5 text-right">Real P&L</th>
                <th className="px-3 py-1.5 text-right">Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {userIds.map((userId) => (
                <UserPositionRow key={userId} userId={userId} positions={allPositions[userId]} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
