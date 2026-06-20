import { useSignal } from "@preact/signals-react";
import {
  type Scenario,
  type ScenarioRun,
  useCreateScenarioMutation,
  useDeleteScenarioMutation,
  useListRunsQuery,
  useListScenariosQuery,
  useRunScenarioMutation,
} from "@veta/frontend/store/scenariosApi.ts";
import { formatUtcTime } from "@veta/frontend/utils/clock.ts";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-divider text-secondary",
  completed: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/60",
  mismatched: "bg-amber-900/60 text-amber-300 border border-amber-700/60",
  failed: "bg-red-900/60 text-red-300 border border-red-700/60",
};

function formatTime(iso: string): string {
  return formatUtcTime(iso);
}

function ScenarioRow({
  scenario,
  onRun,
  onDelete,
  onSelect,
  selected,
  isRunning,
}: {
  scenario: Scenario;
  onRun: () => void;
  onDelete: () => void;
  onSelect: () => void;
  selected: boolean;
  isRunning: boolean;
}) {
  return (
    <tr
      className={`cursor-pointer border-t border-panel/60 hover:bg-panel/40 ${
        selected ? "bg-panel/60" : ""
      }`}
      onClick={onSelect}
      data-testid="scenario-row"
    >
      <td className="px-3 py-1.5 text-secondary font-medium">{scenario.name}</td>
      <td className="px-3 py-1.5 text-label font-mono text-[10px]">
        {scenario.spec.symbol} · {scenario.spec.side} {scenario.spec.quantity}
      </td>
      <td className="px-3 py-1.5 text-label font-mono text-[10px]">seed {scenario.spec.seed}</td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          disabled={isRunning}
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          className="text-emerald-400 hover:text-emerald-300 disabled:text-subtle disabled:cursor-not-allowed mr-2"
          data-testid="scenario-run-btn"
        >
          {isRunning ? "Running…" : "Run"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-red-400/60 hover:text-red-400"
          aria-label={`Delete scenario ${scenario.name}`}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function RunRow({ run }: { run: ScenarioRun }) {
  const cls = STATUS_STYLE[run.status] ?? "bg-divider text-secondary";
  return (
    <tr className="border-t border-panel/40 text-[11px]">
      <td className="px-2 py-1 text-label tabular-nums">{formatTime(run.triggeredAt)}</td>
      <td className="px-2 py-1">
        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${cls}`}>{run.status}</span>
      </td>
      <td className="px-2 py-1 text-default tabular-nums">
        {run.actual ? `${run.actual.fillCount}/${run.actual.totalFilled}` : "—"}
      </td>
      <td className="px-2 py-1 text-default tabular-nums">
        {run.actual ? `${run.actual.slippageBps.toFixed(1)} bps` : "—"}
      </td>
      <td className="px-2 py-1 text-muted font-mono truncate" title={run.parentOrderId ?? ""}>
        {run.parentOrderId ? `${run.parentOrderId.slice(0, 8)}…` : (run.error ?? "")}
      </td>
    </tr>
  );
}

function NewScenarioForm({ onCancel }: { onCancel: () => void }) {
  const name = useSignal("");
  const symbol = useSignal("AAPL");
  const side = useSignal<"BUY" | "SELL">("BUY");
  const quantity = useSignal(100);
  const limitPrice = useSignal(190);
  const seed = useSignal(42);
  const strategy = useSignal("LIMIT");
  const error = useSignal<string | null>(null);
  const [create, { isLoading }] = useCreateScenarioMutation();

  async function handleSave() {
    error.value = null;
    if (name.value.trim().length === 0) {
      error.value = "Name is required";
      return;
    }
    try {
      await create({
        name: name.value.trim(),
        spec: {
          seed: seed.value | 0,
          symbol: symbol.value.toUpperCase(),
          side: side.value,
          quantity: quantity.value,
          limitPrice: limitPrice.value,
          strategy: strategy.value,
        },
      }).unwrap();
      onCancel();
    } catch (err) {
      error.value = (err as { data?: { error?: string } })?.data?.error ?? "Save failed";
    }
  }

  return (
    <div className="p-3 border-b border-panel bg-page/60 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-label col-span-2">
          Name
          <input
            type="text"
            value={name.value}
            onInput={(e) => {
              name.value = (e.target as HTMLInputElement).value;
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary"
            data-testid="scenario-name"
          />
        </label>
        <label className="text-label">
          Symbol
          <input
            type="text"
            value={symbol.value}
            onInput={(e) => {
              symbol.value = (e.target as HTMLInputElement).value.toUpperCase();
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary font-mono uppercase"
          />
        </label>
        <label className="text-label">
          Side
          <select
            value={side.value}
            onChange={(e) => {
              side.value = (e.target as HTMLSelectElement).value as "BUY" | "SELL";
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary"
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </label>
        <label className="text-label">
          Quantity
          <input
            type="number"
            min="1"
            value={quantity.value}
            onInput={(e) => {
              quantity.value = Number((e.target as HTMLInputElement).value);
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary tabular-nums"
          />
        </label>
        <label className="text-label">
          Limit Price
          <input
            type="number"
            step="0.01"
            value={limitPrice.value}
            onInput={(e) => {
              limitPrice.value = Number((e.target as HTMLInputElement).value);
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary tabular-nums"
          />
        </label>
        <label className="text-label">
          Seed
          <input
            type="number"
            value={seed.value}
            onInput={(e) => {
              seed.value = Number((e.target as HTMLInputElement).value);
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary tabular-nums"
          />
        </label>
        <label className="text-label">
          Strategy
          <select
            value={strategy.value}
            onChange={(e) => {
              strategy.value = (e.target as HTMLSelectElement).value;
            }}
            className="mt-0.5 w-full bg-surface border border-panel rounded px-2 py-1 text-secondary"
          >
            <option>LIMIT</option>
            <option>TWAP</option>
            <option>POV</option>
            <option>VWAP</option>
            <option>ICEBERG</option>
          </select>
        </label>
      </div>
      {error.value && <div className="mt-2 text-red-400 text-[11px]">{error.value}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-label hover:text-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading}
          className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
          data-testid="scenario-save-btn"
        >
          {isLoading ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function RunsTable({ scenarioId }: { scenarioId: string }) {
  const { data: runs = [], isLoading } = useListRunsQuery(scenarioId, { pollingInterval: 5_000 });
  if (isLoading) return <div className="p-3 text-xs text-muted">Loading runs…</div>;
  if (runs.length === 0) {
    return <div className="p-3 text-xs text-muted">No runs yet. Hit Run to record one.</div>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-muted uppercase text-[10px]">
        <tr>
          <th className="px-2 py-1 text-left">When</th>
          <th className="px-2 py-1 text-left">Status</th>
          <th className="px-2 py-1 text-left">Fills/Qty</th>
          <th className="px-2 py-1 text-left">Slippage</th>
          <th className="px-2 py-1 text-left">Order / Error</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <RunRow key={r.id} run={r} />
        ))}
      </tbody>
    </table>
  );
}

export function ScenariosPanel() {
  const { data: scenarios = [], isLoading } = useListScenariosQuery();
  const [runScenario, { isLoading: isRunning, originalArgs }] = useRunScenarioMutation();
  const [deleteScenario] = useDeleteScenarioMutation();
  const showForm = useSignal(false);
  const selectedId = useSignal<string | null>(null);

  const selected = scenarios.find((s) => s.id === selectedId.value) ?? null;
  if (!selected && scenarios.length > 0 && selectedId.value === null) {
    selectedId.value = scenarios[0].id;
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel shrink-0">
        <span className="text-label font-medium uppercase tracking-wider">Scenarios</span>
        <button
          type="button"
          onClick={() => {
            showForm.value = !showForm.value;
          }}
          className="px-2 py-0.5 rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900/30 text-[11px]"
          data-testid="scenario-new-btn"
        >
          {showForm.value ? "Close" : "+ New"}
        </button>
      </div>

      {showForm.value && (
        <NewScenarioForm
          onCancel={() => {
            showForm.value = false;
          }}
        />
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading && <div className="p-3 text-muted">Loading…</div>}
        {!isLoading && scenarios.length === 0 && (
          <div className="p-4 text-muted">
            No saved scenarios yet. Click <strong>+ New</strong> to capture one — same seed, same
            symbol, same strategy means the run is repeatable end-to-end.
          </div>
        )}
        {scenarios.length > 0 && (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface/95 backdrop-blur text-muted text-[10px] uppercase">
              <tr>
                <th className="px-3 py-1.5 text-left">Name</th>
                <th className="px-3 py-1.5 text-left">Order</th>
                <th className="px-3 py-1.5 text-left">Seed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <ScenarioRow
                  key={s.id}
                  scenario={s}
                  selected={selectedId.value === s.id}
                  isRunning={isRunning && originalArgs === s.id}
                  onRun={() => {
                    selectedId.value = s.id;
                    runScenario(s.id);
                  }}
                  onDelete={() => deleteScenario(s.id)}
                  onSelect={() => {
                    selectedId.value = s.id;
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="border-t border-panel max-h-72 overflow-auto shrink-0">
          <div className="px-3 py-1 text-[10px] uppercase text-muted bg-page/60">
            Runs · {selected.name}
          </div>
          <RunsTable scenarioId={selected.id} />
        </div>
      )}
    </div>
  );
}
