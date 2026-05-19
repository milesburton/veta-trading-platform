import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";
import {
  useGetOverridesQuery,
  useGetSourcesQuery,
  useToggleFeedMutation,
} from "@veta/frontend/store/marketDataApi.ts";
import { useEffect, useMemo } from "react";

type MarketSession = "pre-market" | "open" | "after-hours" | "closed";

interface ExchangeInfo {
  mic: string;
  name: string;
  hours: string;
}

const EXCHANGES: ExchangeInfo[] = [
  { mic: "XNAS", name: "NASDAQ", hours: "9:30 AM – 4:00 PM ET" },
  { mic: "XNYS", name: "NYSE", hours: "9:30 AM – 4:00 PM ET" },
  { mic: "ARCX", name: "NYSE Arca", hours: "9:30 AM – 4:00 PM ET" },
  { mic: "XCHI", name: "Chicago SE", hours: "9:30 AM – 4:00 PM ET" },
];

function getMarketSession(): MarketSession {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const day = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dow: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayNum = dow[day] ?? 1;
  if (dayNum === 0 || dayNum === 6) return "closed";
  const total = h * 60 + m;
  if (total < 240) return "closed"; // before 4:00 AM ET
  if (total < 570) return "pre-market"; // 4:00–9:30 AM ET
  if (total < 960) return "open"; // 9:30 AM–4:00 PM ET
  if (total < 1200) return "after-hours"; // 4:00–8:00 PM ET
  return "closed";
}

function sessionBadge(session: MarketSession): { label: string; cls: string } {
  switch (session) {
    case "open":
      return {
        label: "Open",
        cls: "bg-emerald-900/40 text-emerald-400 border border-emerald-700/50",
      };
    case "pre-market":
      return {
        label: "Pre-market",
        cls: "bg-blue-900/30 text-blue-400 border border-blue-700/40",
      };
    case "after-hours":
      return {
        label: "After-hours",
        cls: "bg-amber-900/30 text-amber-400 border border-amber-700/40",
      };
    case "closed":
      return {
        label: "Closed",
        cls: "bg-panel/60 text-muted border border-divider/40",
      };
  }
}

export function MarketFeedControlPanel() {
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const isAdmin = userRole === "admin";
  const assets = useAppSelector((s) => s.market.assets);

  const { data: sources = [], isLoading: sourcesLoading } = useGetSourcesQuery();
  const { data: overridesData } = useGetOverridesQuery();
  const [toggleFeed, { isLoading: toggling }] = useToggleFeedMutation();

  // Market session clock — recalculates every 60s
  const session = useSignal<MarketSession>(getMarketSession());
  useEffect(() => {
    const id = setInterval(() => {
      session.value = getMarketSession();
    }, 60_000);
    return () => clearInterval(id);
  }, [session]);

  const search = useSignal("");

  const serverOverrides = overridesData?.overrides ?? {};
  // Consider feed paused if any togglable external source is paused
  const anySourcePaused = sources.some((s) => s.id !== "synthetic" && !s.active && s.enabled);

  const symbolRows = useMemo(() => {
    return assets
      .filter((a) => !search.value || a.symbol.toLowerCase().includes(search.value.toLowerCase()))
      .map((a) => {
        const src = serverOverrides[a.symbol] ?? "synthetic";
        const srcDef = sources.find((s) => s.id === src);
        return {
          symbol: a.symbol,
          exchange: a.exchange ?? "—",
          source: src,
          sourceLabel: srcDef?.label ?? src,
          paused: src !== "synthetic" && srcDef ? !srcDef.active : false,
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [assets, serverOverrides, sources, search.value]);

  const externalCount = symbolRows.filter((r) => r.source !== "synthetic").length;
  const badge = sessionBadge(session.value);

  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-panel shrink-0">
        <span className="text-[11px] font-semibold text-label uppercase tracking-wide">
          Market Feed Control
        </span>
      </div>

      <section
        className="flex-1 overflow-y-auto"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region needs keyboard focus (WCAG SC 2.1.1)
        tabIndex={0}
        aria-label="Market data feed controls"
      >
        {/* ── Feed Status ── */}
        <div className="px-4 pt-3 pb-2 border-b border-panel/60">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">
            Feed Status
          </div>
          {sourcesLoading ? (
            <div className="text-[11px] text-muted">Loading…</div>
          ) : (
            <div className="flex gap-2">
              {sources.map((src) => {
                const isPaused = !src.active && src.enabled;
                const dotColor =
                  src.enabled && src.active
                    ? "bg-emerald-500"
                    : src.enabled && !src.active
                      ? "bg-amber-400"
                      : "bg-subtle";
                return (
                  <div key={src.id} className="flex-1 bg-surface rounded p-2.5 border border-panel">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <span className="text-[11px] font-semibold text-secondary flex-1 truncate">
                        {src.label}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono border shrink-0 ${
                          !src.enabled
                            ? "bg-panel/40 text-muted border-divider/40"
                            : isPaused
                              ? "bg-amber-900/20 text-amber-400 border-amber-700/40"
                              : "bg-emerald-900/20 text-emerald-400 border-emerald-700/40"
                        }`}
                      >
                        {!src.enabled ? "unavailable" : isPaused ? "paused" : "active"}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted leading-relaxed mb-1">
                      {src.description}
                    </div>
                    {src.requiresApiKey && (
                      <div
                        className={`text-[9px] font-semibold uppercase tracking-wide ${
                          src.apiKeyConfigured ? "text-emerald-400" : "text-amber-500"
                        }`}
                      >
                        {src.apiKeyConfigured ? "API key configured" : "API key not set"}
                      </div>
                    )}
                    {isAdmin && src.id !== "synthetic" && src.apiKeyConfigured && (
                      <button
                        type="button"
                        onClick={() => toggleFeed(src.id)}
                        disabled={toggling}
                        className={`mt-2 w-full px-2 py-1 rounded text-[10px] font-semibold border transition-colors disabled:opacity-40 ${
                          isPaused
                            ? "text-emerald-400 border-emerald-700/50 hover:bg-emerald-900/20"
                            : "text-amber-400 border-amber-700/50 hover:bg-amber-900/20"
                        }`}
                      >
                        {toggling ? "…" : isPaused ? "Resume Feed" : "Pause Feed"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Market Hours ── */}
        <div className="px-4 pt-3 pb-2 border-b border-panel/60">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">
            Market Hours <span className="text-divider normal-case font-normal">(US Eastern)</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXCHANGES.map((ex) => (
              <div key={ex.mic} className="bg-surface rounded p-2.5 border border-panel">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-secondary">{ex.name}</span>
                  <span className="text-[9px] font-mono text-muted">{ex.mic}</span>
                </div>
                <div className="text-[10px] text-muted mb-1.5">{ex.hours}</div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-divider mt-1.5">
            Stub — uses browser clock · no holiday calendar
          </div>
        </div>

        {/* ── Symbol Overview ── */}
        <div className="px-4 pt-3 pb-2">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">
            Symbol Overview
          </div>
          <input
            type="text"
            placeholder="Search symbol…"
            value={search.value}
            onChange={(e) => {
              search.value = e.target.value;
            }}
            className="w-full mb-2 bg-panel border border-divider rounded px-2 py-1 text-[11px] text-secondary placeholder:text-muted"
          />
        </div>

        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-page z-10">
            <tr className="border-b border-panel">
              <th
                className="text-left px-4 py-1.5 text-[10px] text-muted uppercase tracking-wide font-medium"
                title="Instrument ticker symbol"
              >
                Symbol
              </th>
              <th
                className="text-left px-4 py-1.5 text-[10px] text-muted uppercase tracking-wide font-medium"
                title="Exchange or venue providing the feed"
              >
                Exchange
              </th>
              <th
                className="text-left px-4 py-1.5 text-[10px] text-muted uppercase tracking-wide font-medium"
                title="Market data source adapter"
              >
                Source
              </th>
              <th
                className="text-right px-4 py-1.5 text-[10px] text-muted uppercase tracking-wide font-medium"
                title="Feed status: live or paused"
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {symbolRows.map((row) => (
              <tr key={row.symbol} className="border-b border-surface">
                <td className="px-4 py-1.5 font-mono text-[11px] text-default">{row.symbol}</td>
                <td className="px-4 py-1.5 text-[10px] font-mono text-muted">{row.exchange}</td>
                <td className="px-4 py-1.5 text-[10px] text-muted">{row.sourceLabel}</td>
                <td className="px-4 py-1.5 text-right">
                  {row.paused ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono border bg-amber-900/20 text-amber-400 border-amber-700/40">
                      Paused
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono border bg-emerald-900/20 text-emerald-400 border-emerald-700/40">
                      Active
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {symbolRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted text-[11px]">
                  No symbols match
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-panel shrink-0 text-[9px] text-muted">
        {symbolRows.length} symbol{symbolRows.length !== 1 ? "s" : ""} · {externalCount} on external
        feeds · {anySourcePaused ? "some feeds paused" : "all active"}
      </div>
    </div>
  );
}
