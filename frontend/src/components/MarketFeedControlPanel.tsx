import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";
import {
  useGetOverridesQuery,
  useGetSourcesQuery,
  useToggleFeedMutation,
} from "../store/marketDataApi.ts";

// ── Market hours ───────────────────────────────────────────────────────────────

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
        cls: "bg-gray-800/60 text-gray-500 border border-gray-700/40",
      };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketFeedControlPanel() {
  const userRole = useAppSelector((s) => s.auth.user?.role);
  const isAdmin = userRole === "admin";
  const assets = useAppSelector((s) => s.market.assets);

  const { data: sources = [], isLoading: sourcesLoading } = useGetSourcesQuery();
  const { data: overridesData } = useGetOverridesQuery();
  const [toggleFeed, { isLoading: toggling }] = useToggleFeedMutation();

  // Market session clock — recalculates every 60s
  const [session, setSession] = useState<MarketSession>(getMarketSession);
  useEffect(() => {
    const id = setInterval(() => setSession(getMarketSession()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [search, setSearch] = useState("");

  const serverOverrides = overridesData?.overrides ?? {};
  const alphaVantageSource = sources.find((s) => s.id === "alpha-vantage");
  const feedIsPaused = alphaVantageSource ? !alphaVantageSource.active : false;

  const symbolRows = useMemo(() => {
    return assets
      .filter((a) => !search || a.symbol.toLowerCase().includes(search.toLowerCase()))
      .map((a) => ({
        symbol: a.symbol,
        exchange: a.exchange ?? "—",
        source: serverOverrides[a.symbol] ?? "synthetic",
        paused: serverOverrides[a.symbol] === "alpha-vantage" && feedIsPaused,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [assets, serverOverrides, feedIsPaused, search]);

  const alphaVantageCount = symbolRows.filter((r) => r.source === "alpha-vantage").length;
  const badge = sessionBadge(session);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300 text-xs">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          Market Feed Control
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Feed Status ── */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-800/60">
          <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Feed Status
          </div>
          {sourcesLoading ? (
            <div className="text-[11px] text-gray-600">Loading…</div>
          ) : (
            <div className="flex gap-2">
              {sources.map((src) => {
                const isAlphaVantage = src.id === "alpha-vantage";
                const isPaused = isAlphaVantage && !src.active;
                const dotColor =
                  src.enabled && src.active
                    ? "bg-emerald-500"
                    : src.enabled && !src.active
                      ? "bg-amber-400"
                      : "bg-gray-600";
                return (
                  <div
                    key={src.id}
                    className="flex-1 bg-gray-900 rounded p-2.5 border border-gray-800"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <span className="text-[11px] font-semibold text-gray-200 flex-1 truncate">
                        {src.label}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono border shrink-0 ${
                          !src.enabled
                            ? "bg-gray-800/40 text-gray-500 border-gray-700/40"
                            : isPaused
                              ? "bg-amber-900/20 text-amber-400 border-amber-700/40"
                              : "bg-emerald-900/20 text-emerald-400 border-emerald-700/40"
                        }`}
                      >
                        {!src.enabled ? "unavailable" : isPaused ? "paused" : "active"}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500 leading-relaxed mb-1">
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
                    {isAdmin && isAlphaVantage && src.apiKeyConfigured && (
                      <button
                        type="button"
                        onClick={() => toggleFeed("alpha-vantage")}
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
        <div className="px-4 pt-3 pb-2 border-b border-gray-800/60">
          <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Market Hours <span className="text-gray-700 normal-case font-normal">(US Eastern)</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXCHANGES.map((ex) => (
              <div key={ex.mic} className="bg-gray-900 rounded p-2.5 border border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-gray-200">{ex.name}</span>
                  <span className="text-[9px] font-mono text-gray-600">{ex.mic}</span>
                </div>
                <div className="text-[10px] text-gray-500 mb-1.5">{ex.hours}</div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-gray-700 mt-1.5">
            Stub — uses browser clock · no holiday calendar
          </div>
        </div>

        {/* ── Symbol Overview ── */}
        <div className="px-4 pt-3 pb-2">
          <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Symbol Overview
          </div>
          <input
            type="text"
            placeholder="Search symbol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full mb-2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600"
          />
        </div>

        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-950 z-10">
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                Symbol
              </th>
              <th className="text-left px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                Exchange
              </th>
              <th className="text-left px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                Source
              </th>
              <th className="text-right px-4 py-1.5 text-[10px] text-gray-600 uppercase tracking-wide font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {symbolRows.map((row) => (
              <tr key={row.symbol} className="border-b border-gray-900">
                <td className="px-4 py-1.5 font-mono text-[11px] text-gray-300">{row.symbol}</td>
                <td className="px-4 py-1.5 text-[10px] font-mono text-gray-500">{row.exchange}</td>
                <td className="px-4 py-1.5 text-[10px] text-gray-500">
                  {row.source === "alpha-vantage" ? "Alpha Vantage" : "Synthetic"}
                </td>
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
                <td colSpan={4} className="px-4 py-6 text-center text-gray-600 text-[11px]">
                  No symbols match
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-gray-800 shrink-0 text-[9px] text-gray-700">
        {symbolRows.length} symbol{symbolRows.length !== 1 ? "s" : ""} · {alphaVantageCount} on
        Alpha Vantage · feed {feedIsPaused ? "paused" : "active"}
      </div>
    </div>
  );
}
