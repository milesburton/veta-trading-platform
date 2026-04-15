import { useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import {
  type RiskConfig,
  type RiskPosition,
  useGetBreakersQuery,
  useGetPositionsQuery,
  useGetRiskConfigQuery,
  useUpdateRiskConfigMutation,
} from "../store/riskApi.ts";
import { formatCurrency, pnlColor } from "../utils/format.ts";
import { PopOutButton } from "./PopOutButton.tsx";

interface BreakerStripEntry {
  key: string;
  type: "market-move" | "user-pnl";
  scope?: "symbol" | "user";
  target: string;
  observedValue?: number;
  threshold?: number;
  firedAt: number;
  expiresAt: number;
}

function BreakerStrip() {
  const wsActive = useAppSelector((s) => s.breakers.active);
  const { data } = useGetBreakersQuery(undefined, { pollingInterval: 5_000 });
  const now = Date.now();

  const merged: Record<string, BreakerStripEntry> = {};
  for (const a of wsActive) {
    if (a.expiresAt <= now) continue;
    merged[a.key] = {
      key: a.key,
      type: a.type,
      scope: a.scope,
      target: a.target,
      observedValue: a.observedValue,
      threshold: a.threshold,
      firedAt: a.firedAt,
      expiresAt: a.expiresAt,
    };
  }
  for (const a of data?.active ?? []) {
    if (a.expiresAt <= now) continue;
    if (!merged[a.key]) {
      merged[a.key] = {
        key: a.key,
        type: a.type,
        target: a.target,
        firedAt: a.firedAt,
        expiresAt: a.expiresAt,
      };
    }
  }
  const entries = Object.values(merged).sort((a, b) => b.firedAt - a.firedAt);

  if (entries.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-red-900/40 bg-red-950/30">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-red-400 font-medium uppercase tracking-wider text-[10px]">
          Halted
        </span>
        {entries.map((e) => {
          const remaining = Math.max(0, Math.round((e.expiresAt - now) / 1000));
          const detail =
            e.type === "market-move" && e.observedValue !== undefined
              ? `${e.observedValue.toFixed(1)}% move`
              : e.type === "user-pnl" && e.observedValue !== undefined
                ? `P&L $${e.observedValue.toFixed(0)}`
                : e.type;
          return (
            <span
              key={e.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-900/40 border border-red-800/60 text-red-200 text-[11px]"
            >
              <span className="font-medium">{e.target}</span>
              <span className="text-red-400/80">({detail})</span>
              <span className="text-red-500/70">· expires in {remaining}s</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function HeadroomBar({
  label,
  ratio,
  accentWhenHigh,
}: {
  label: string;
  ratio: number;
  accentWhenHigh: boolean;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const pct = (clamped * 100).toFixed(0);
  const color = !accentWhenHigh
    ? clamped > 0.8
      ? "bg-red-500"
      : clamped > 0.5
        ? "bg-amber-500"
        : "bg-emerald-500"
    : clamped > 0.8
      ? "bg-red-500"
      : clamped > 0.5
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-20">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

function UserPositionRow({
  userId,
  positions,
  riskConfig,
}: {
  userId: string;
  positions: RiskPosition[];
  riskConfig?: RiskConfig;
}) {
  const totalUnrealised = positions.reduce((s, p) => s + p.unrealisedPnl, 0);
  const totalRealised = positions.reduce((s, p) => s + p.realisedPnl, 0);
  const totalPnl = totalUnrealised + totalRealised;
  const grossNotional = positions.reduce((s, p) => s + Math.abs(p.netQty * p.markPrice), 0);
  const netNotional = positions.reduce((s, p) => s + p.netQty * p.markPrice, 0);
  const fillCount = positions.reduce((s, p) => s + p.fillCount, 0);

  const notionalRatio =
    riskConfig && riskConfig.maxGrossNotional > 0 ? grossNotional / riskConfig.maxGrossNotional : 0;
  const pnlRatio = riskConfig
    ? totalPnl < 0
      ? -totalPnl / Math.abs(riskConfig.maxDailyLoss)
      : 0
    : 0;

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
      {riskConfig && (
        <tr className="border-t border-gray-900/30 bg-gray-950/40">
          <td colSpan={7} className="px-3 py-1.5">
            <div className="flex flex-col gap-1 max-w-md">
              <HeadroomBar label="Notional" ratio={notionalRatio} accentWhenHigh />
              <HeadroomBar label="Loss" ratio={pnlRatio} accentWhenHigh />
            </div>
          </td>
        </tr>
      )}
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

function BreakerConfigEditor({ riskConfig }: { riskConfig: RiskConfig }) {
  const [updateConfig, { isLoading }] = useUpdateRiskConfigMutation();
  const [draft, setDraft] = useState({
    maxGrossNotional: riskConfig.maxGrossNotional,
    maxDailyLoss: riskConfig.maxDailyLoss,
    maxConcentrationPct: riskConfig.maxConcentrationPct,
    haltMovePercent: riskConfig.haltMovePercent,
    breakerCooldownMs: riskConfig.breakerCooldownMs,
    breakersEnabled: riskConfig.breakersEnabled,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      maxGrossNotional: riskConfig.maxGrossNotional,
      maxDailyLoss: riskConfig.maxDailyLoss,
      maxConcentrationPct: riskConfig.maxConcentrationPct,
      haltMovePercent: riskConfig.haltMovePercent,
      breakerCooldownMs: riskConfig.breakerCooldownMs,
      breakersEnabled: riskConfig.breakersEnabled,
    });
  }, [
    riskConfig.maxGrossNotional,
    riskConfig.maxDailyLoss,
    riskConfig.maxConcentrationPct,
    riskConfig.haltMovePercent,
    riskConfig.breakerCooldownMs,
    riskConfig.breakersEnabled,
  ]);

  const dirty =
    draft.maxGrossNotional !== riskConfig.maxGrossNotional ||
    draft.maxDailyLoss !== riskConfig.maxDailyLoss ||
    draft.maxConcentrationPct !== riskConfig.maxConcentrationPct ||
    draft.haltMovePercent !== riskConfig.haltMovePercent ||
    draft.breakerCooldownMs !== riskConfig.breakerCooldownMs ||
    draft.breakersEnabled !== riskConfig.breakersEnabled;

  const apply = async () => {
    setError(null);
    if (draft.maxDailyLoss >= 0) {
      setError("maxDailyLoss must be negative");
      return;
    }
    try {
      await updateConfig(draft).unwrap();
    } catch (e) {
      setError((e as { data?: { error?: string } })?.data?.error ?? "failed to update");
    }
  };

  return (
    <div className="px-3 py-2 border-t border-gray-800 bg-gray-950/60">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          Breaker & Limit Config
        </span>
        <div className="flex items-center gap-2">
          {error && <span className="text-[10px] text-red-400">{error}</span>}
          <button
            type="button"
            onClick={apply}
            disabled={!dirty || isLoading}
            className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:hover:bg-gray-800 border border-gray-700 text-gray-200"
          >
            Apply
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[10px]">
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Max gross notional ($)</span>
          <input
            type="number"
            value={draft.maxGrossNotional}
            onChange={(e) => setDraft({ ...draft, maxGrossNotional: Number(e.target.value) })}
            className="w-24 px-1 py-0.5 bg-gray-900 border border-gray-800 text-right tabular-nums text-gray-200"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Max daily loss ($)</span>
          <input
            type="number"
            value={draft.maxDailyLoss}
            onChange={(e) => setDraft({ ...draft, maxDailyLoss: Number(e.target.value) })}
            className="w-24 px-1 py-0.5 bg-gray-900 border border-gray-800 text-right tabular-nums text-gray-200"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Max concentration (%)</span>
          <input
            type="number"
            value={draft.maxConcentrationPct}
            onChange={(e) => setDraft({ ...draft, maxConcentrationPct: Number(e.target.value) })}
            className="w-24 px-1 py-0.5 bg-gray-900 border border-gray-800 text-right tabular-nums text-gray-200"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Halt move (%)</span>
          <input
            type="number"
            value={draft.haltMovePercent}
            onChange={(e) => setDraft({ ...draft, haltMovePercent: Number(e.target.value) })}
            className="w-24 px-1 py-0.5 bg-gray-900 border border-gray-800 text-right tabular-nums text-gray-200"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Cooldown (ms)</span>
          <input
            type="number"
            value={draft.breakerCooldownMs}
            onChange={(e) => setDraft({ ...draft, breakerCooldownMs: Number(e.target.value) })}
            className="w-24 px-1 py-0.5 bg-gray-900 border border-gray-800 text-right tabular-nums text-gray-200"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="text-gray-500">Breakers enabled</span>
          <input
            type="checkbox"
            checked={draft.breakersEnabled}
            onChange={(e) => setDraft({ ...draft, breakersEnabled: e.target.checked })}
          />
        </label>
      </div>
    </div>
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
              {riskConfig.maxOrdersPerSecond}/s · ADV {riskConfig.maxAdvPct}% · halt{" "}
              {riskConfig.haltMovePercent}%
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

      <BreakerStrip />

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
                <UserPositionRow
                  key={userId}
                  userId={userId}
                  positions={allPositions[userId]}
                  riskConfig={riskConfig}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {riskConfig && <BreakerConfigEditor riskConfig={riskConfig} />}
    </div>
  );
}
