import { useState } from "react";
import { useAppSelector } from "../store/hooks.ts";

type LoadTestStatus = "idle" | "running" | "done" | "error";

interface LoadTestResult {
  jobId: string;
  submitted: number;
  symbols: string[];
  strategy: string;
}

const STRATEGIES = ["LIMIT", "TWAP", "POV", "VWAP", "ICEBERG", "SNIPER", "ARRIVAL_PRICE"] as const;

export function LoadTestPanel() {
  const user = useAppSelector((s) => s.auth.user);

  const [orderCount, setOrderCount] = useState(100);
  const [strategy, setStrategy] = useState<string>("LIMIT");
  const [symbols, setSymbols] = useState("AAPL,MSFT,GOOGL,AMZN,TSLA");
  const [status, setStatus] = useState<LoadTestStatus>("idle");
  const [lastResult, setLastResult] = useState<LoadTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs">
        <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-gray-200 uppercase tracking-wide">
              Load Test
            </span>
            <span className="text-[10px] text-gray-600">
              Admin only — injects bulk orders into the live pipeline
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-1">
            <div className="text-[13px] font-semibold text-amber-400">Admin access required</div>
            <div className="text-[11px] text-gray-600">
              You must be logged in as an admin to use the load test runner.
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("running");
    setError(null);
    setLastResult(null);

    const symbolsArray = symbols
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/gateway/load-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderCount, strategy, symbols: symbolsArray }),
      });

      if (res.status === 202) {
        const data = (await res.json()) as LoadTestResult;
        setLastResult(data);
        setStatus("done");
      } else if (res.status === 403) {
        setError("Admin role required — you are not an admin");
        setStatus("error");
      } else {
        let msg = `Request failed with status ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // ignore parse failure
        }
        setError(msg);
        setStatus("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — request failed");
      setStatus("error");
    }
  }

  const isRunning = status === "running";

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs">
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold text-gray-200 uppercase tracking-wide">
            Load Test
          </span>
          <span className="text-[10px] text-gray-600">
            Admin only — injects bulk orders into the live pipeline
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[10px] text-amber-400 leading-relaxed">
          <span className="font-semibold">Warning:</span> This will submit real orders to the
          trading pipeline. Use in simulation only.
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="lt-order-count"
              className="block text-[10px] text-gray-500 uppercase tracking-wide font-medium"
            >
              Order Count
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={500}
                step={10}
                value={orderCount}
                onChange={(e) => setOrderCount(Number(e.target.value))}
                disabled={isRunning}
                className="flex-1 accent-blue-500 disabled:opacity-50"
              />
              <input
                id="lt-order-count"
                type="number"
                min={1}
                max={500}
                step={10}
                value={orderCount}
                onChange={(e) => setOrderCount(Math.min(500, Math.max(1, Number(e.target.value))))}
                disabled={isRunning}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 tabular-nums text-right disabled:opacity-50"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="lt-strategy"
              className="block text-[10px] text-gray-500 uppercase tracking-wide font-medium"
            >
              Strategy
            </label>
            <select
              id="lt-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              disabled={isRunning}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 disabled:opacity-50"
            >
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="lt-symbols"
              className="block text-[10px] text-gray-500 uppercase tracking-wide font-medium"
            >
              Symbols (comma-separated)
            </label>
            <input
              id="lt-symbols"
              type="text"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              disabled={isRunning}
              placeholder="AAPL,MSFT,GOOGL,AMZN,TSLA"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 font-mono placeholder:text-gray-600 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isRunning}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-semibold text-white transition-colors"
          >
            {isRunning && (
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
            )}
            {isRunning ? "Submitting…" : "Run Load Test"}
          </button>
        </form>

        {status === "done" && lastResult && (
          <div className="rounded border border-emerald-700/50 bg-emerald-950/30 px-3 py-2.5 space-y-1.5">
            <div className="text-[11px] font-semibold text-emerald-400">Job submitted</div>
            <div className="space-y-0.5 text-[10px] text-gray-400">
              <div>
                <span className="text-gray-600">Job ID:</span>{" "}
                <span className="font-mono text-gray-300">{lastResult.jobId}</span>
              </div>
              <div>
                <span className="text-gray-600">Orders submitted:</span>{" "}
                <span className="tabular-nums text-gray-300">
                  {lastResult.submitted.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Strategy:</span>{" "}
                <span className="font-mono text-gray-300">{lastResult.strategy}</span>
              </div>
              <div>
                <span className="text-gray-600">Symbols:</span>{" "}
                <span className="font-mono text-gray-300">{lastResult.symbols.join(", ")}</span>
              </div>
            </div>
            <div className="pt-1 text-[10px] text-gray-600 leading-relaxed">
              Orders are injected via the message bus. Fill results appear in the Order Blotter
              within ~30 seconds.
            </div>
          </div>
        )}

        {status === "error" && error && (
          <div className="rounded border border-red-700/50 bg-red-950/30 px-3 py-2 text-[10px] text-red-400 leading-relaxed">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}
      </div>
    </div>
  );
}
