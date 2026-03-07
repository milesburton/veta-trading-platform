import { useState } from "react";
import { useRequestAdvisoryMutation } from "../store/advisoryApi.ts";
import type { AdvisoryStatus } from "../store/advisorySlice.ts";
import { selectAdvisoryForSymbol } from "../store/advisorySlice.ts";
import { useAppSelector } from "../store/hooks.ts";

interface AdvisoryPanelProps {
  symbol: string;
}

function StatusBadge({ status }: { status: AdvisoryStatus }) {
  const configs: Record<AdvisoryStatus, { label: string; className: string }> = {
    "not-requested": { label: "Not requested", className: "text-gray-500" },
    queued: { label: "Queued…", className: "text-amber-400" },
    running: { label: "Analysing…", className: "text-blue-400" },
    ready: { label: "Fresh", className: "text-emerald-400" },
    stale: { label: "Stale", className: "text-amber-400" },
    failed: { label: "Failed", className: "text-red-400" },
  };
  const cfg = configs[status];
  return <span className={`text-[10px] font-mono ${cfg.className}`}>{cfg.label}</span>;
}

export function AdvisoryPanel({ symbol }: AdvisoryPanelProps) {
  const now = Date.now();
  const bySymbol = useAppSelector((s) => s.advisory.bySymbol);
  const entry = selectAdvisoryForSymbol(bySymbol, symbol, now);
  const [requestAdvisory, { isLoading: isRequesting }] = useRequestAdvisoryMutation();
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleRequest() {
    setRequestError(null);
    try {
      const result = await requestAdvisory({ symbol }).unwrap();
      if (result.status === "deduplicated") {
        setRequestError("A recent advisory job already exists for this symbol.");
      }
    } catch {
      setRequestError("Failed to request advisory. The LLM service may not be enabled.");
    }
  }

  const ageSeconds = entry.note ? Math.round((now - entry.note.createdAt) / 1000) : null;

  return (
    <div className="border border-gray-800 rounded bg-gray-900 p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
          AI Advisory
        </span>
        <StatusBadge status={entry.status} />
      </div>

      {(entry.status === "not-requested" || entry.status === "failed") && (
        <div className="flex flex-col gap-1">
          {entry.status === "failed" && entry.errorMessage && (
            <div className="text-[10px] text-red-400 mb-1">{entry.errorMessage}</div>
          )}
          <button
            type="button"
            onClick={handleRequest}
            disabled={isRequesting}
            className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors disabled:opacity-50 w-fit"
          >
            {isRequesting ? "Requesting…" : entry.status === "failed" ? "Retry" : "Get Advisory"}
          </button>
          {requestError && <div className="text-[10px] text-amber-400">{requestError}</div>}
        </div>
      )}

      {(entry.status === "queued" || entry.status === "running") && (
        <div className="text-[10px] text-gray-400">
          {entry.status === "queued"
            ? "Waiting for LLM worker…"
            : `Generating with ${entry.note?.modelId ?? "model"}…`}
          {entry.jobId && (
            <span className="ml-1 text-gray-600 font-mono">{entry.jobId.slice(0, 8)}</span>
          )}
        </div>
      )}

      {(entry.status === "ready" || entry.status === "stale") && entry.note && (
        <div>
          <div className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-wrap mb-2">
            {entry.note.content}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[9px] text-gray-600 font-mono">
              {entry.note.provider} · {ageSeconds !== null ? `${ageSeconds}s ago` : ""}
            </div>
            <button
              type="button"
              onClick={handleRequest}
              disabled={isRequesting}
              className="px-2 py-0.5 text-[9px] bg-gray-800 hover:bg-gray-700 text-gray-500 rounded transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 text-[9px] text-gray-600 italic">
        For educational purposes only. Not financial advice.
      </div>
    </div>
  );
}
