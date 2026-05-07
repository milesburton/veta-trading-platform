import { useSignal } from "@preact/signals-react";
import { type DemoPersona, useGetDemoPersonasQuery } from "../store/userApi.ts";

const STYLE_LABELS: Record<string, string> = {
  high_touch: "High touch",
  low_touch: "Low touch",
  fi_voice: "FI voice",
  fx_electronic: "FX electronic",
  commodities_voice: "Commodities voice",
  derivatives_high_touch: "Derivs high touch",
  derivatives_low_touch: "Derivs low touch",
  oversight: "Oversight",
};

const DESK_LABELS: Record<string, string> = {
  "equity-cash": "Equity cash",
  "equity-derivs": "Equity derivs",
  "fi-rates": "FI rates",
  "fi-credit": "FI credit",
  "fi-govies": "FI govies",
  "fx-cash": "FX cash",
  commodities: "Commodities",
  "cross-desk": "Cross-desk",
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  trader: "bg-emerald-900/40 text-emerald-400 border border-emerald-800",
  "desk-head": "bg-sky-900/40 text-sky-400 border border-sky-800",
  sales: "bg-purple-900/40 text-purple-400 border border-purple-800",
  "external-client": "bg-amber-900/40 text-amber-400 border border-amber-800",
  compliance: "bg-slate-800 text-slate-300 border border-slate-700",
  admin: "bg-red-900/40 text-red-400 border border-red-800",
};

interface DemoPersonasProps {
  onSelect: (username: string) => void;
}

export function DemoPersonas({ onSelect }: DemoPersonasProps) {
  const expanded = useSignal(false);
  const { data, isLoading, error } = useGetDemoPersonasQuery(undefined, {
    skip: !expanded.value,
  });

  const personas = data?.personas ?? [];
  const grouped = groupPersonas(personas);

  return (
    <div data-testid="demo-personas" className="mt-6 rounded-xl border border-panel bg-surface/50">
      <button
        type="button"
        data-testid="demo-personas-toggle"
        onClick={() => {
          expanded.value = !expanded.value;
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-default hover:bg-panel/40 transition-colors rounded-xl"
      >
        <span className="font-medium tracking-wide uppercase text-[11px] text-label">
          Demo personas
        </span>
        <span className="text-muted text-xs">{expanded.value ? "▾ hide" : "▸ show list"}</span>
      </button>

      {expanded.value && (
        <div className="px-4 pb-4 pt-1 space-y-4 max-h-[480px] overflow-auto">
          {isLoading && <div className="text-xs text-muted py-2">Loading personas...</div>}
          {error && (
            <div className="text-xs text-red-400 py-2">
              Failed to load personas — demo mode may be disabled on this deployment.
            </div>
          )}
          {!isLoading && !error && personas.length === 0 && (
            <div className="text-xs text-muted py-2">No personas available.</div>
          )}
          {Object.entries(grouped).map(([groupLabel, items]) => (
            <div key={groupLabel}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">
                {groupLabel}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    onSelect={() => onSelect(persona.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaCard({ persona, onSelect }: { persona: DemoPersona; onSelect: () => void }) {
  const styleLabel = persona.trading_style ? STYLE_LABELS[persona.trading_style] : null;
  const deskLabel = persona.primary_desk ? DESK_LABELS[persona.primary_desk] : null;
  const roleBadgeClass = ROLE_BADGE_CLASS[persona.role] ?? "bg-panel text-label";

  return (
    <button
      type="button"
      data-testid={`persona-${persona.id}`}
      onClick={onSelect}
      className="text-left p-3 rounded-lg border border-panel bg-page/60 hover:bg-panel/40 hover:border-divider transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none shrink-0">{persona.avatar_emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-secondary truncate">{persona.name}</div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${roleBadgeClass}`}>
              {persona.role}
            </span>
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            {deskLabel && <span>{deskLabel}</span>}
            {deskLabel && styleLabel && <span className="mx-1">·</span>}
            {styleLabel && <span>{styleLabel}</span>}
          </div>
          <div className="text-[11px] text-label mt-1 line-clamp-2">
            {persona.description || "—"}
          </div>
          <div className="text-[9px] text-subtle mt-1 font-mono">Sign in as {persona.id}</div>
        </div>
      </div>
    </button>
  );
}

function groupPersonas(personas: DemoPersona[]): Record<string, DemoPersona[]> {
  const groups: Record<string, DemoPersona[]> = {};
  const order: string[] = [];

  function push(label: string, p: DemoPersona) {
    if (!(label in groups)) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(p);
  }

  for (const p of personas) {
    if (p.role !== "trader") continue;
    if (p.primary_desk === "equity-cash") push("Equity cash traders", p);
    else if (p.primary_desk === "equity-derivs") push("Equity derivatives traders", p);
    else if (
      p.primary_desk === "fi-rates" ||
      p.primary_desk === "fi-credit" ||
      p.primary_desk === "fi-govies"
    ) {
      push("Fixed income traders", p);
    } else if (p.primary_desk === "fx-cash") push("FX traders", p);
    else if (p.primary_desk === "commodities") push("Commodities traders", p);
    else push("Traders", p);
  }
  for (const p of personas) {
    if (p.role === "desk-head") push("Desk heads", p);
  }
  for (const p of personas) {
    if (p.role === "sales") push("Sales", p);
  }
  for (const p of personas) {
    if (p.role === "external-client") push("External clients", p);
  }
  for (const p of personas) {
    if (p.role === "compliance") push("Compliance", p);
  }
  for (const p of personas) {
    if (p.role === "admin") push("Administration", p);
  }

  const ordered: Record<string, DemoPersona[]> = {};
  for (const label of order) ordered[label] = groups[label];
  return ordered;
}
