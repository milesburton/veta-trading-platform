import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import {
  useGetOverridesQuery,
  useGetSourcesQuery,
  useSetOverridesMutation,
} from "@veta/frontend/store/marketDataApi.ts";
import { useEffect } from "react";

export function MarketDataSourcesPanel() {
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const isAdmin = userRole === "admin";

  const assets = useAppSelector((s) => s.market.assets);
  const symbols = assets.map((a) => a.symbol).sort();

  const { data: sourcesData } = useGetSourcesQuery();
  const sources = Array.isArray(sourcesData) ? sourcesData : [];
  const { data: overridesData, isLoading: overridesLoading } = useGetOverridesQuery();
  const [setOverrides, { isLoading: saving }] = useSetOverridesMutation();

  const pending = useSignal<Record<string, string>>({});
  const hasPending = useSignal(false);
  const saveError = useSignal<string | null>(null);
  const saveSuccess = useSignal(false);

  const search = useSignal("");
  const showOverridesOnly = useSignal(false);

  useEffect(() => {
    if (overridesData) {
      pending.value = {};
      hasPending.value = false;
    }
  }, [overridesData, hasPending, pending]);

  const serverOverrides = overridesData?.overrides ?? {};
  const anyExternalAvailable = sources.some((s) => s.id !== "synthetic" && s.enabled);

  function getSymbolSource(sym: string): string {
    if (sym in pending.value) return pending.value[sym];
    return serverOverrides[sym] ?? "synthetic";
  }

  function handleSourceChange(sym: string, newSource: string) {
    pending.value = { ...pending.value, [sym]: newSource };
    hasPending.value = true;
    saveSuccess.value = false;
    saveError.value = null;
  }

  async function handleSave() {
    const merged: Record<string, string> = { ...serverOverrides };
    for (const [sym, src] of Object.entries(pending.value)) {
      if (src === "synthetic") {
        delete merged[sym];
      } else {
        merged[sym] = src;
      }
    }
    try {
      await setOverrides(merged).unwrap();
      pending.value = {};
      hasPending.value = false;
      saveSuccess.value = true;
      setTimeout(() => {
        saveSuccess.value = false;
      }, 3000);
    } catch (err) {
      saveError.value = (err as { data?: { error?: string } })?.data?.error ?? "Failed to save";
    }
  }

  function handleResetAll() {
    const resetMap: Record<string, string> = {};
    for (const sym of symbols) {
      resetMap[sym] = "synthetic";
    }
    pending.value = resetMap;
    hasPending.value = true;
    saveSuccess.value = false;
    saveError.value = null;
  }

  const externalCount = symbols.filter((s) => getSymbolSource(s) !== "synthetic").length;

  const filteredSymbols = symbols.filter((sym) => {
    if (search.value && !sym.toLowerCase().includes(search.value.toLowerCase())) {
      return false;
    }
    if (showOverridesOnly.value && getSymbolSource(sym) === "synthetic") return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Market Data Sources
        </span>
      </div>

      <div className="flex gap-3 px-4 py-3 border-b border-panel shrink-0">
        {sources.map((src) => (
          <div key={src.id} className="flex-1 bg-surface rounded p-2.5 border border-panel">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  src.enabled ? "bg-emerald-500" : "bg-subtle"
                }`}
              />
              <span className="text-[11px] font-semibold text-secondary">{src.label}</span>
            </div>
            <div className="text-[10px] text-muted leading-relaxed">{src.description}</div>
            {src.requiresApiKey && (
              <div
                className={`mt-1.5 text-[9px] font-semibold uppercase tracking-wide ${
                  src.apiKeyConfigured ? "text-emerald-400" : "text-amber-500"
                }`}
              >
                {src.apiKeyConfigured ? "API key configured" : "API key not set"}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-panel shrink-0">
        <input
          type="text"
          placeholder="Search symbol…"
          value={search.value}
          onChange={(e) => {
            search.value = e.target.value;
          }}
          className="flex-1 bg-panel border border-divider rounded px-2 py-1 text-[11px] text-secondary placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => {
            showOverridesOnly.value = !showOverridesOnly.value;
          }}
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            showOverridesOnly.value
              ? "bg-amber-800/50 text-amber-300 border border-amber-700"
              : "bg-panel text-muted border border-divider hover:text-default"
          }`}
        >
          Overrides only
        </button>
      </div>

      <section
        className="flex-1 overflow-y-auto"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region needs keyboard focus (WCAG SC 2.1.1)
        tabIndex={0}
        aria-label="Market data sources"
      >
        {overridesLoading ? (
          <div className="flex items-center justify-center h-24 text-muted text-[11px]">
            Loading…
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-page z-10">
              <tr className="border-b border-panel">
                <th className="text-left px-4 py-1.5 text-[10px] text-muted uppercase tracking-wide font-medium">
                  Symbol
                </th>
                <th className="text-right px-4 py-1.5 text-[10px] text-muted uppercase tracking-wide font-medium">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSymbols.map((sym) => {
                const currentSource = getSymbolSource(sym);
                const isDirty = sym in pending.value;
                return (
                  <tr
                    key={sym}
                    className={`border-b border-surface ${isDirty ? "bg-amber-950/20" : ""}`}
                  >
                    <td className="px-4 py-1.5">
                      <span
                        className={`font-mono text-[11px] ${
                          isDirty ? "text-amber-300" : "text-default"
                        }`}
                      >
                        {sym}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      {isAdmin ? (
                        <select
                          aria-label={`Data source for ${sym}`}
                          value={currentSource}
                          onChange={(e) => handleSourceChange(sym, e.target.value)}
                          disabled={!anyExternalAvailable && currentSource === "synthetic"}
                          className={`bg-panel border rounded px-2 py-0.5 text-[10px] ${
                            isDirty
                              ? "border-amber-700 text-amber-300"
                              : "border-divider text-default"
                          } disabled:opacity-50`}
                        >
                          <option value="synthetic">Synthetic</option>
                          {sources
                            .filter((s) => s.id !== "synthetic" && s.id !== "fred")
                            .map((s) => (
                              <option key={s.id} value={s.id} disabled={!s.enabled}>
                                {s.label}
                                {!s.enabled ? " (no key)" : ""}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="text-[10px] text-muted">
                          {currentSource === "synthetic"
                            ? "Synthetic"
                            : (sources.find((s) => s.id === currentSource)?.label ?? currentSource)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredSymbols.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-muted text-[11px]">
                    No symbols match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {isAdmin && (
        <div className="px-4 py-2.5 border-t border-panel shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasPending.value || saving}
            className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-[11px] font-semibold text-white transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-panel hover:bg-divider disabled:opacity-40 text-[11px] text-label transition-colors border border-divider"
          >
            Reset All to Synthetic
          </button>
          {saveSuccess.value && <span className="text-[10px] text-emerald-400 ml-1">Saved</span>}
          {saveError.value && (
            <span className="text-[10px] text-red-400 ml-1">{saveError.value}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-panel shrink-0 text-[9px] text-muted">
        {externalCount} symbol{externalCount !== 1 ? "s" : ""} on external sources ·{" "}
        {sources.filter((s) => s.id !== "synthetic" && s.enabled).length} provider
        {sources.filter((s) => s.id !== "synthetic" && s.enabled).length !== 1 ? "s" : ""}{" "}
        configured
      </div>
    </div>
  );
}
