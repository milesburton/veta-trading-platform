import { useSignal } from "@preact/signals-react";
import {
  useGetLoadGenStatusQuery,
  useStartLoadGenMutation,
  useStopLoadGenMutation,
} from "@veta/frontend/store/gatewayApi.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import type { AssetDef } from "@veta/frontend/types.ts";
import { useEffect } from "react";

const RATE_PRESETS = [10, 25, 50, 100, 250, 500] as const;
const AUTO_STOP_PRESETS = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "4 hours", ms: 4 * 60 * 60_000 },
  { label: "24 hours", ms: 24 * 60 * 60_000 },
] as const;

const FALLBACK_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "NVDA",
  "TSLA",
  "JPM",
  "V",
  "WMT",
];

function pickDefaultSymbols(assets: AssetDef[]): string[] {
  const universe = assets.filter((a) => (a.assetClass ? a.assetClass === "equity" : true));
  if (universe.length === 0) return FALLBACK_SYMBOLS;

  const present = new Set(universe.map((a) => a.symbol));
  const preferred = FALLBACK_SYMBOLS.filter((symbol) => present.has(symbol));
  const ranked = [...universe].sort((a, b) => (b.dailyVolume ?? 0) - (a.dailyVolume ?? 0));
  const rankedSymbols = ranked.map((a) => a.symbol);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const symbol of [...preferred, ...rankedSymbols]) {
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
    if (out.length >= 10) break;
  }
  return out.length > 0 ? out : FALLBACK_SYMBOLS;
}

export function LoadGenPanel() {
  const user = useAppSelector((s) => s.auth.user);
  const assets = useAppSelector((s) => s.market.assets);
  const role = user?.role;
  const allowed = role === "admin" || role === "oncall";

  const ratePerSecond = useSignal<number>(50);
  const autoStopAfterMs = useSignal<number>(60 * 60_000);
  const symbolsCsv = useSignal<string>("");
  const sizeMin = useSignal<number>(100);
  const sizeMax = useSignal<number>(5_000);

  useEffect(() => {
    if (symbolsCsv.value.trim()) return;
    symbolsCsv.value = pickDefaultSymbols(assets).join(",");
  }, [assets, symbolsCsv]);

  const { data: status, refetch } = useGetLoadGenStatusQuery(undefined, {
    pollingInterval: 1_000,
    skip: !allowed,
  });
  const [start, { isLoading: starting }] = useStartLoadGenMutation();
  const [stop, { isLoading: stopping }] = useStopLoadGenMutation();

  if (!allowed) {
    return (
      <div className="flex flex-col h-full bg-page text-default text-xs">
        <div className="px-4 py-2.5 border-b border-panel shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-secondary uppercase tracking-wide">
              Load Generator
            </span>
            <span className="text-[10px] text-subtle">Admin / oncall only</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-1">
            <div className="text-[13px] font-semibold text-amber-400">
              Admin or oncall access required
            </div>
            <div className="text-[11px] text-subtle">
              Sustained synthetic load against the live order pipeline.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const running = status?.running ?? false;
  const ordersPerMinute =
    running && status
      ? Math.round(
          (status.ordersSent / Math.max(1, (Date.now() - (status.startedAt ?? 0)) / 1000)) * 60
        )
      : 0;
  const runtimeSec =
    running && status?.startedAt ? Math.floor((Date.now() - status.startedAt) / 1000) : 0;
  const autoStopRemainingSec =
    running && status?.stopAt ? Math.max(0, Math.floor((status.stopAt - Date.now()) / 1000)) : 0;

  async function onStart() {
    const symbols = symbolsCsv.value
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    await start({
      ratePerSecond: ratePerSecond.value,
      autoStopAfterMs: autoStopAfterMs.value,
      symbols,
      sizeMin: sizeMin.value,
      sizeMax: sizeMax.value,
    })
      .unwrap()
      .catch(() => {});
    refetch();
  }

  async function onStop() {
    await stop()
      .unwrap()
      .catch(() => {});
    refetch();
  }

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs overflow-hidden">
      <div className="px-4 py-2.5 border-b border-panel shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-secondary uppercase tracking-wide">
            Load Generator
          </span>
          <span className="text-[10px] text-subtle">
            Sustained synthetic load against the live order pipeline
          </span>
        </div>
        {running && (
          <div
            data-testid="load-gen-running-badge"
            className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-900/30 text-amber-300 border-amber-800"
            title="Load generator is currently running"
          >
            ● RUNNING
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {running ? (
          <RunningStatus
            ordersSent={status?.ordersSent ?? 0}
            ordersFailed={status?.ordersFailed ?? 0}
            ordersPerMinute={ordersPerMinute}
            runtimeSec={runtimeSec}
            autoStopRemainingSec={autoStopRemainingSec}
            ratePerSecond={status?.config?.ratePerSecond ?? 0}
            lastError={status?.lastError ?? null}
          />
        ) : (
          <ConfigForm
            ratePerSecond={ratePerSecond}
            autoStopAfterMs={autoStopAfterMs}
            symbolsCsv={symbolsCsv}
            sizeMin={sizeMin}
            sizeMax={sizeMax}
          />
        )}
      </div>

      <div className="border-t border-panel px-4 py-3 shrink-0 flex justify-end gap-2">
        {running ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            data-testid="load-gen-stop"
            className="px-3 py-1.5 rounded text-xs font-semibold bg-red-700 hover:bg-red-600 text-white border border-red-800 disabled:opacity-50 transition-colors"
          >
            {stopping ? "Stopping..." : "Stop load generator"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            data-testid="load-gen-start"
            className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-800 disabled:opacity-50 transition-colors"
          >
            {starting ? "Starting..." : "Start load generator"}
          </button>
        )}
      </div>
    </div>
  );
}

interface RunningStatusProps {
  ordersSent: number;
  ordersFailed: number;
  ordersPerMinute: number;
  runtimeSec: number;
  autoStopRemainingSec: number;
  ratePerSecond: number;
  lastError: string | null;
}

function RunningStatus(p: RunningStatusProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Orders sent"
          value={p.ordersSent.toLocaleString()}
          testId="load-gen-orders-sent"
        />
        <Stat
          label="Failures"
          value={p.ordersFailed.toLocaleString()}
          valueClass={p.ordersFailed > 0 ? "text-amber-400" : "text-default"}
          testId="load-gen-orders-failed"
        />
        <Stat
          label="Live rate"
          value={`${p.ordersPerMinute.toLocaleString()}/min`}
          testId="load-gen-rate"
        />
        <Stat label="Configured rate" value={`${p.ratePerSecond}/s`} />
        <Stat label="Runtime" value={fmtDuration(p.runtimeSec)} />
        <Stat
          label="Auto-stop in"
          value={fmtDuration(p.autoStopRemainingSec)}
          valueClass="text-secondary"
        />
      </div>
      {p.lastError && (
        <div className="p-2 rounded border bg-red-900/20 border-red-800 text-[11px] text-red-300">
          <span className="font-semibold">Last error:</span> {p.lastError}
        </div>
      )}
    </div>
  );
}

interface ConfigFormProps {
  ratePerSecond: { value: number };
  autoStopAfterMs: { value: number };
  symbolsCsv: { value: string };
  sizeMin: { value: number };
  sizeMax: { value: number };
}

function ConfigForm(p: ConfigFormProps) {
  return (
    <div className="space-y-4">
      <Field
        label="Rate (orders / second)"
        hint="Spread evenly across configured users + symbols. Capped at 1000/s."
      >
        <div className="flex gap-1.5 flex-wrap">
          {RATE_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => (p.ratePerSecond.value = r)}
              data-testid={`load-gen-rate-${r}`}
              className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                p.ratePerSecond.value === r
                  ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
                  : "bg-panel/40 text-default border-divider hover:border-muted"
              }`}
            >
              {r}
            </button>
          ))}
          <input
            type="number"
            value={p.ratePerSecond.value}
            min={1}
            max={1000}
            onChange={(e) => (p.ratePerSecond.value = Number(e.target.value))}
            data-testid="load-gen-rate-input"
            className="w-20 px-2 py-1 rounded text-[11px] font-mono bg-panel/40 border border-divider text-default"
          />
        </div>
      </Field>

      <Field
        label="Auto-stop after"
        hint="Safety cap. The agent stops itself even if no operator clicks Stop."
      >
        <div className="flex gap-1.5 flex-wrap">
          {AUTO_STOP_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => (p.autoStopAfterMs.value = preset.ms)}
              data-testid={`load-gen-autostop-${preset.label.replace(/\s/g, "")}`}
              className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors ${
                p.autoStopAfterMs.value === preset.ms
                  ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
                  : "bg-panel/40 text-default border-divider hover:border-muted"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Symbols (comma-separated)" hint="Equity tickers. Defaults to top 10 mega-cap.">
        <input
          type="text"
          value={p.symbolsCsv.value}
          onChange={(e) => (p.symbolsCsv.value = e.target.value)}
          data-testid="load-gen-symbols-input"
          className="w-full px-2 py-1 rounded text-[11px] font-mono bg-panel/40 border border-divider text-default"
        />
      </Field>

      <Field label="Order size range (shares)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={p.sizeMin.value}
            min={1}
            onChange={(e) => (p.sizeMin.value = Number(e.target.value))}
            data-testid="load-gen-sizemin-input"
            className="w-24 px-2 py-1 rounded text-[11px] font-mono bg-panel/40 border border-divider text-default"
          />
          <span className="text-subtle">to</span>
          <input
            type="number"
            value={p.sizeMax.value}
            min={p.sizeMin.value}
            onChange={(e) => (p.sizeMax.value = Number(e.target.value))}
            data-testid="load-gen-sizemax-input"
            className="w-24 px-2 py-1 rounded text-[11px] font-mono bg-panel/40 border border-divider text-default"
          />
        </div>
      </Field>

      <div className="text-[10px] text-subtle leading-relaxed pt-1 border-t border-divider">
        Strategy mix uses the realistic buy-side default: 30% LIMIT, 20% TWAP, 15% VWAP, 12% POV, 8%
        Iceberg, 5% Sniper, 5% Arrival-Price, 3% Momentum, 2% IS. Custom mix configurable via the
        API.
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold text-secondary">{label}</span>
        {hint && <span className="text-[10px] text-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-default",
  testId,
}: {
  label: string;
  value: string;
  valueClass?: string;
  testId?: string;
}) {
  return (
    <div className="space-y-0.5 p-2 rounded bg-panel/40 border border-divider">
      <div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div>
      <div className={`text-base font-mono font-semibold ${valueClass}`} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}
