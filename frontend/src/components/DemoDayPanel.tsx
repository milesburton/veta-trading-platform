import { useEffect, useRef, useState } from "react";
import type { DemoDayResult } from "../store/gatewayApi.ts";
import { useRunDemoDayMutation } from "../store/gatewayApi.ts";
import { useAppSelector } from "../store/hooks.ts";

interface LocalDemoResult extends DemoDayResult {
  jobId: string;
}

interface Scenario {
  id: string;
  label: string;
  description: string;
  icon: string;
  orderEstimate: string;
  colour: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "standard",
    label: "Standard Trading Day",
    description:
      "Balanced mix of LIMIT, TWAP, VWAP, and algo strategies across all assets. Representative of a typical session with natural buy/sell pressure.",
    icon: "▶",
    orderEstimate: "~100 orders",
    colour: "blue",
  },
  {
    id: "market-open",
    label: "Market Open",
    description:
      "Frenzied opening burst: LIMIT and SNIPER orders flood in over the first few seconds, settling into calmer TWAP/VWAP institutional flow.",
    icon: "⚡",
    orderEstimate: "~120 orders",
    colour: "amber",
  },
  {
    id: "volatile",
    label: "Volatile Session",
    description:
      "High-volatility simulation: aggressive SNIPER and ICEBERG orders dominate with skewed buy pressure and large block sizes.",
    icon: "⚠",
    orderEstimate: "~100 orders",
    colour: "red",
  },
  {
    id: "institutional",
    label: "Institutional Flow",
    description:
      "Large-block TWAP, VWAP, and ICEBERG orders from institutional players — minimal LIMIT, concentrated on large-cap and financial stocks.",
    icon: "🏛",
    orderEstimate: "~50 orders",
    colour: "purple",
  },
];

const COLOUR_MAP: Record<string, string> = {
  blue: "border-blue-600/50 bg-blue-950/30 text-blue-300 hover:bg-blue-900/40 ring-blue-500",
  amber: "border-amber-600/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 ring-amber-500",
  red: "border-red-700/50 bg-red-950/30 text-red-300 hover:bg-red-900/40 ring-red-500",
  purple:
    "border-purple-700/50 bg-purple-950/30 text-purple-300 hover:bg-purple-900/40 ring-purple-500",
};

const BADGE_MAP: Record<string, string> = {
  blue: "bg-blue-800/60 text-blue-200",
  amber: "bg-amber-800/60 text-amber-200",
  red: "bg-red-800/60 text-red-200",
  purple: "bg-purple-800/60 text-purple-200",
};

export function DemoDayPanel() {
  const user = useAppSelector((s) => s.auth.user);
  const [selected, setSelected] = useState<string>("standard");
  const [result, setResult] = useState<LocalDemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [runDemoDay, { isLoading: isRunning }] = useRunDemoDayMutation();

  // Clean up elapsed timer on unmount
  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  async function handleLaunch() {
    setError(null);
    setResult(null);
    setElapsed(0);
    const startedAt = Date.now();

    tickerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      500
    );

    const res = await runDemoDay({ scenario: selected });

    if (tickerRef.current) clearInterval(tickerRef.current);
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));

    if ("data" in res) {
      setResult(res.data as LocalDemoResult);
    } else if ("error" in res) {
      const err = res.error;
      if (err && "status" in err) {
        const status = (err as { status: number }).status;
        const data = (err as { data?: { error?: string } }).data;
        if (status === 401) setError("Session expired — please log in again");
        else if (status === 503) setError("Message bus unavailable — is Redpanda running?");
        else setError(data?.error ?? `Request failed (${status})`);
      } else {
        setError("Network error");
      }
    }
  }

  const scenario = SCENARIOS.find((s) => s.id === selected) ?? SCENARIOS[0];

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-gray-200 uppercase tracking-wide">
            Demo Day
          </span>
          <span className="text-[10px] text-gray-600">
            Simulate a realistic trading session across all strategies
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Intro */}
        <p className="text-[10px] text-gray-500 leading-relaxed">
          Choose a scenario below and click{" "}
          <span className="text-gray-300 font-medium">Launch Demo</span> to inject a realistic wave
          of orders into the live pipeline. Orders fan out across all assets and strategies over the
          next ~30 seconds, filling the blotter, algo monitor, and Grafana dashboards with real
          trade flow.
        </p>

        {/* Scenario selector */}
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
            Scenario
          </div>
          <div className="space-y-2">
            {SCENARIOS.map((sc) => {
              const active = sc.id === selected;
              const colours = COLOUR_MAP[sc.colour];
              const badge = BADGE_MAP[sc.colour];
              return (
                <button
                  type="button"
                  key={sc.id}
                  onClick={() => {
                    if (!isRunning) setSelected(sc.id);
                  }}
                  disabled={isRunning}
                  className={[
                    "w-full text-left rounded border px-3 py-2.5 transition-colors",
                    "focus:outline-none focus:ring-1",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    colours,
                    active ? "ring-1" : "",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]" aria-hidden="true">
                        {sc.icon}
                      </span>
                      <span className="text-[11px] font-semibold">{sc.label}</span>
                    </div>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium ${badge}`}
                    >
                      {sc.orderEstimate}
                    </span>
                  </div>
                  <p className="text-[10px] opacity-80 leading-snug">{sc.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Launch button */}
        <button
          type="button"
          onClick={handleLaunch}
          disabled={isRunning}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-semibold text-white transition-colors"
        >
          {isRunning ? (
            <>
              <svg
                className="animate-spin h-3 w-3 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Launching… ({elapsed}s)
            </>
          ) : result ? (
            "Launch Another Demo"
          ) : (
            `Launch Demo — ${scenario.label}`
          )}
        </button>

        {/* Success result */}
        {!isRunning && result && (
          <div className="rounded border border-emerald-700/50 bg-emerald-950/30 px-3 py-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-emerald-400">Demo launched</div>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Scenario</span>
                <span className="text-gray-200 font-medium">{result.scenario}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Orders injected</span>
                <span className="text-emerald-300 tabular-nums font-semibold">
                  {result.submitted.toLocaleString()}
                </span>
              </div>
              {"jobId" in result && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Job ID</span>
                  <span className="text-gray-400 font-mono text-[9px]">{result.jobId}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed pt-1">
              Orders are staggered over the next ~30 seconds. Watch the Order Blotter, Algo Monitor,
              Throughput Gauges, and Grafana for live activity.
            </p>
          </div>
        )}

        {/* Error */}
        {!isRunning && error && (
          <div className="rounded border border-red-700/50 bg-red-950/30 px-3 py-2 text-[10px] text-red-400 leading-relaxed">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* What to watch */}
        <div className="rounded border border-gray-800 px-3 py-2.5 space-y-1.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            What to watch
          </div>
          <ul className="space-y-1 text-[10px] text-gray-500 list-disc list-inside leading-relaxed">
            <li>
              <span className="text-gray-400">Order Blotter</span> — rows appear as orders are
              submitted
            </li>
            <li>
              <span className="text-gray-400">Algo Monitor</span> — active strategy count rises
            </li>
            <li>
              <span className="text-gray-400">Throughput Gauges</span> — orders/min and fills/min
              spike
            </li>
            <li>
              <span className="text-gray-400">Decision Log</span> — algo reasoning events stream in
            </li>
            <li>
              <span className="text-gray-400">Grafana / Observability</span> — full pipeline
              telemetry
            </li>
          </ul>
        </div>

        {/* User context note */}
        {user && (
          <div className="text-[9px] text-gray-700 text-center">
            Orders will be attributed to <span className="text-gray-500">{user.name}</span> (
            {user.id})
          </div>
        )}
      </div>
    </div>
  );
}
