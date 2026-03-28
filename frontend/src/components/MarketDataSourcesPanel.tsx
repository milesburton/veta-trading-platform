import { useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import {
  useGetOverridesQuery,
  useGetSourcesQuery,
  useSetOverridesMutation,
} from "../store/marketDataApi.ts";

export function MarketDataSourcesPanel() {
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const isAdmin = userRole === "admin";

  const assets = useAppSelector((s) => s.market.assets);
  const symbols = Object.keys(assets).sort();

  const { data: sources = [] } = useGetSourcesQuery();
  const { data: overridesData, isLoading: overridesLoading } = useGetOverridesQuery();
  const [setOverrides, { isLoading: saving }] = useSetOverridesMutation();

  const [pending, setPending] = useState<Record<string, string>>({});
  const [hasPending, setHasPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [search, setSearch] = useState("");
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);

  useEffect(() => {
    if (overridesData) {
      setPending({});
      setHasPending(false);
    }
  }, [overridesData]);

  const serverOverrides = overridesData?.overrides ?? {};
  const anyExternalAvailable = sources.some((s) => s.id !== "synthetic" && s.enabled);

  function getSymbolSource(symbol: string): string {
    if (symbol in pending) return pending[symbol];
    return serverOverrides[symbol] ?? "synthetic";
  }

  function handleSourceChange(symbol: string, newSource: string) {
    setPending((prev) => {
      const next = { ...prev, [symbol]: newSource };
      setHasPending(true);
      return next;
    });
    setSaveSuccess(false);
    setSaveError(null);
  }

  async function handleSave() {
    const merged: Record<string, string> = { ...serverOverrides };
    for (const [sym, src] of Object.entries(pending)) {
      if (src === "synthetic") {
        delete merged[sym];
      } else {
        merged[sym] = src;
      }
    }
    try {
      await setOverrides(merged).unwrap();
      setPending({});
      setHasPending(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError((err as { data?: { error?: string } })?.data?.error ?? "Failed to save");
    }
  }

  function handleResetAll() {
    const resetMap: Record<string, string> = {};
    for (const sym of symbols) {
      resetMap[sym] = "synthetic";
    }
    setPending(resetMap);
    setHasPending(true);
    setSaveSuccess(false);
    setSaveError(null);
  }

  const externalCount = symbols.filter((s) => getSymbolSource(s) !== "synthetic").length;

  const filteredSymbols = symbols.filter((sym) => {
    if (search && !sym.toLowerCase().includes(search.toLowerCase())) return false;
    if (showOverridesOnly && getSymbolSource(sym) === "synthetic") return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Market Data Sources
        </span>
      </div>

      <div className="flex gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
        {sources.map((src) => (
          <div key={src.id} className="flex-1 bg-gray-900 rounded p-2.5 border border-gray-800">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  src.enabled ? "bg-emerald-500" : "bg-gray-600"
                }`}
              />
              <span className="text-[11px] font-semibold text-gray-200">{src.label}</span>
            </div>
            <div className="text-[10px] text-gray-500 leading-relaxed">{src.description}</div>
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

      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 shrink-0">
        <input
          type="text"
          placeholder="Search symbol…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600"
        />
        <button
          type="button"
          onClick={() => setShowOverridesOnly((v) => !v)}
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            showOverridesOnly
              ? "bg-amber-800/50 text-amber-300 border border-amber-700"
              : "bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300"
          }`}
        >
          Overrides only
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {overridesLoading ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-[11px]">
            Loading…
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-950 z-10">
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Symbol
                </th>
                <th className="text-right px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSymbols.map((sym) => {
                const currentSource = getSymbolSource(sym);
                const isDirty = sym in pending;
                return (
                  <tr
                    key={sym}
                    className={`border-b border-gray-900 ${isDirty ? "bg-amber-950/20" : ""}`}
                  >
                    <td className="px-4 py-1.5">
                      <span
                        className={`font-mono text-[11px] ${isDirty ? "text-amber-300" : "text-gray-300"}`}
                      >
                        {sym}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      {isAdmin ? (
                        <select
                          value={currentSource}
                          onChange={(e) => handleSourceChange(sym, e.target.value)}
                          disabled={!anyExternalAvailable && currentSource === "synthetic"}
                          className={`bg-gray-800 border rounded px-2 py-0.5 text-[10px] ${
                            isDirty
                              ? "border-amber-700 text-amber-300"
                              : "border-gray-700 text-gray-300"
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
                        <span className="text-[10px] text-gray-500">
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
                  <td colSpan={2} className="px-4 py-6 text-center text-gray-600 text-[11px]">
                    No symbols match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {isAdmin && (
        <div className="px-4 py-2.5 border-t border-gray-800 shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasPending || saving}
            className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-[11px] font-semibold text-white transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-[11px] text-gray-400 transition-colors border border-gray-700"
          >
            Reset All to Synthetic
          </button>
          {saveSuccess && <span className="text-[10px] text-emerald-400 ml-1">Saved</span>}
          {saveError && <span className="text-[10px] text-red-400 ml-1">{saveError}</span>}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-gray-800 shrink-0 text-[9px] text-gray-700">
        {externalCount} symbol{externalCount !== 1 ? "s" : ""} on external sources ·{" "}
        {sources.filter((s) => s.id !== "synthetic" && s.enabled).length} provider
        {sources.filter((s) => s.id !== "synthetic" && s.enabled).length !== 1 ? "s" : ""}{" "}
        configured
      </div>
    </div>
  );
}
