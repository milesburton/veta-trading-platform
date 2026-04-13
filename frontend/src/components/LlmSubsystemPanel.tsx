import { useSignal } from "@preact/signals-react";
import {
  useGetLlmSubsystemStateQuery,
  useRequestWatchlistBriefMutation,
  useTriggerWorkerMutation,
  useUpdateLlmSubsystemStateMutation,
} from "../store/advisoryApi.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { LlmSubsystemState, LlmTriggerMode } from "../store/llmSubsystemSlice.ts";

const STATE_CONFIGS: Record<LlmSubsystemState, { label: string; dot: string }> = {
  disabled: { label: "Disabled", dot: "bg-gray-600" },
  armed: { label: "Armed", dot: "bg-emerald-500" },
  active: { label: "Active", dot: "bg-blue-400" },
  cooldown: { label: "Cooldown", dot: "bg-amber-400" },
  error: { label: "Error", dot: "bg-red-500" },
};

const TRIGGER_MODES: LlmTriggerMode[] = [
  "disabled",
  "manual",
  "on-demand-ui",
  "scheduled-batch",
  "event-driven",
];

export function LlmSubsystemPanel() {
  const { data: serverState, refetch } = useGetLlmSubsystemStateQuery(undefined, {
    pollingInterval: 30_000,
  });
  const liveState = useAppSelector((s) => s.llmSubsystem.status);
  const status = liveState ?? serverState ?? null;

  const [updateState, { isLoading: isUpdating }] = useUpdateLlmSubsystemStateMutation();
  const [requestBrief, { isLoading: isBriefing }] = useRequestWatchlistBriefMutation();
  const [triggerWorker, { isLoading: isTriggering }] = useTriggerWorkerMutation();
  const error = useSignal<string | null>(null);
  const success = useSignal<string | null>(null);

  async function patch(changes: Parameters<typeof updateState>[0]) {
    error.value = null;
    success.value = null;
    try {
      await updateState(changes).unwrap();
      success.value = "Updated";
      refetch();
    } catch {
      error.value = "Failed to update LLM subsystem state";
    }
    setTimeout(() => {
      success.value = null;
    }, 3000);
  }

  async function handleBrief() {
    error.value = null;
    try {
      const res = await requestBrief({}).unwrap();
      success.value = `Queued ${res.count} advisory job(s)`;
    } catch {
      error.value = "Failed to queue watchlist brief";
    }
    setTimeout(() => {
      success.value = null;
    }, 4000);
  }

  async function handleTriggerWorker() {
    error.value = null;
    try {
      await triggerWorker().unwrap();
      success.value = "Worker started";
    } catch {
      error.value = "Failed to start worker — check LLM_WORKER_ENABLED";
    }
    setTimeout(() => {
      success.value = null;
    }, 4000);
  }

  const state = status?.state ?? "disabled";
  const cfg = STATE_CONFIGS[state];

  return (
    <div
      data-testid="llm-subsystem-panel"
      className="flex flex-col h-full bg-gray-950 text-gray-100 text-[11px] overflow-y-auto"
    >
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 shrink-0">
        <span className="font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
          LLM Advisory Subsystem
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
          <span className="text-gray-300 font-mono">{cfg.label}</span>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-4">
        {(error.value || success.value) && (
          <div
            className={`text-[10px] px-2 py-1 rounded ${
              error.value
                ? "bg-red-950 text-red-400 border border-red-800"
                : "bg-emerald-950 text-emerald-400 border border-emerald-800"
            }`}
          >
            {error.value ?? success.value}
          </div>
        )}

        <section>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
            Subsystem Controls
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Advisory enabled</span>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => patch({ enabled: !status?.policy?.enabled })}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  status?.policy?.enabled ? "bg-emerald-600" : "bg-gray-700"
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    status?.policy?.enabled ? "translate-x-4" : ""
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Worker enabled</span>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => patch({ workerEnabled: !status?.policy?.workerEnabled })}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  status?.policy?.workerEnabled ? "bg-emerald-600" : "bg-gray-700"
                } disabled:opacity-50`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    status?.policy?.workerEnabled ? "translate-x-4" : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
            Trigger Mode
          </div>
          <div className="flex flex-wrap gap-1">
            {TRIGGER_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={isUpdating}
                onClick={() => patch({ triggerMode: mode })}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors disabled:opacity-50 ${
                  status?.triggerMode === mode
                    ? "bg-gray-700 border-gray-500 text-gray-200"
                    : "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Status</div>
          <div className="space-y-1 text-[10px] font-mono">
            <div className="flex justify-between">
              <span className="text-gray-500">Pending jobs</span>
              <span className="text-gray-300">{status?.pendingJobs ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tracked symbols</span>
              <span className="text-gray-300">{status?.trackedSymbols ?? "—"}</span>
            </div>
            {status?.ts && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last update</span>
                <span className="text-gray-500">{new Date(status.ts).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Actions</div>
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={isBriefing || !status?.policy?.enabled}
              onClick={handleBrief}
              className="w-full px-3 py-1.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors disabled:opacity-40 text-left"
            >
              {isBriefing ? "Queuing…" : "Generate watchlist brief"}
            </button>
            <button
              type="button"
              disabled={isTriggering || !status?.policy?.workerEnabled}
              onClick={handleTriggerWorker}
              className="w-full px-3 py-1.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors disabled:opacity-40 text-left"
            >
              {isTriggering ? "Starting…" : "Start LLM worker"}
            </button>
          </div>
        </section>

        <div className="text-[9px] text-gray-700 border-t border-gray-800 pt-2 italic">
          All outputs are advisory only. The LLM is not the source of truth for trading decisions.
        </div>
      </div>
    </div>
  );
}
