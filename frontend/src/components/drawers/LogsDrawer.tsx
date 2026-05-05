import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { Drawer } from "./Drawer.tsx";

export const LOGS_DRAWER_ID = "logs";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const ENDPOINT = `${ORIGIN}/api/gateway/logs/query`;

const SERVICES = [
  "all",
  "gateway",
  "oms",
  "ems",
  "risk-engine",
  "journal",
  "user-service",
  "market-sim",
  "limit-algo",
  "twap-algo",
  "pov-algo",
  "vwap-algo",
  "kafka-relay",
  "feature-engine",
  "signal-engine",
  "recommendation-engine",
];

const LEVELS = ["all", "error", "warn", "info", "debug"];

const SINCE_PRESETS = [
  { id: "5m", label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
];

interface LogLine {
  ts: number;
  service: string;
  level: string;
  message: string;
  trace_id?: string;
  raw: string;
}

interface QueryResponse {
  lines: LogLine[];
  source: "loki" | "ring-buffer";
  lokiConfigured: boolean;
  ringSize: number;
}

const LEVEL_COLOURS: Record<string, string> = {
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-sky-400",
  debug: "text-gray-500",
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(11, 23);
}

export function LogsDrawer() {
  const service = useSignal<string>("all");
  const level = useSignal<string>("all");
  const search = useSignal<string>("");
  const since = useSignal<string>("15m");
  const lines = useSignal<LogLine[]>([]);
  const meta = useSignal<{ source: string; lokiConfigured: boolean } | null>(null);
  const isLoading = useSignal<boolean>(false);
  const error = useSignal<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runQuery() {
    isLoading.value = true;
    error.value = null;
    const params = new URLSearchParams({ since: since.value, limit: "300" });
    if (service.value !== "all") params.set("service", service.value);
    if (level.value !== "all") params.set("level", level.value);
    if (search.value.trim().length > 0) params.set("q", search.value.trim());
    try {
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        error.value = `HTTP ${res.status}`;
        lines.value = [];
        return;
      }
      const body = (await res.json()) as QueryResponse;
      lines.value = body.lines;
      meta.value = { source: body.source, lokiConfigured: body.lokiConfigured };
    } catch (err) {
      error.value = (err as Error).message;
      lines.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  useEffect(() => {
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleRun(delayMs = 250) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(), delayMs);
  }

  return (
    <Drawer id={LOGS_DRAWER_ID} title="Logs">
      <div className="flex flex-col h-full text-xs">
        <div className="px-3 py-2 border-b border-gray-800 bg-gray-950/60 flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search log message…"
              value={search.value}
              onInput={(e) => {
                search.value = (e.target as HTMLInputElement).value;
                scheduleRun(400);
              }}
              className="flex-1 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-gray-200 focus:border-emerald-700 focus:outline-none"
              data-testid="logs-search"
            />
            <button
              type="button"
              onClick={() => runQuery()}
              className="px-2 py-1 rounded border border-gray-700 text-gray-300 hover:border-emerald-700 hover:text-emerald-300 transition-colors"
              data-testid="logs-refresh"
            >
              {isLoading.value ? "…" : "Refresh"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <label className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
              Service
              <select
                value={service.value}
                onChange={(e) => {
                  service.value = (e.target as HTMLSelectElement).value;
                  scheduleRun(0);
                }}
                className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200"
                data-testid="logs-service"
              >
                {SERVICES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
              Level
              <select
                value={level.value}
                onChange={(e) => {
                  level.value = (e.target as HTMLSelectElement).value;
                  scheduleRun(0);
                }}
                className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[11px] text-gray-200"
                data-testid="logs-level"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
              Window
              {SINCE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    since.value = p.id;
                    scheduleRun(0);
                  }}
                  aria-pressed={since.value === p.id}
                  className={`px-1.5 py-0.5 rounded text-[11px] border transition-colors ${
                    since.value === p.id
                      ? "border-emerald-700 bg-emerald-900/30 text-emerald-300"
                      : "border-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {meta.value && (
            <div className="text-[10px] text-gray-500">
              {lines.value.length} line(s) · source: {meta.value.source}
              {!meta.value.lokiConfigured &&
                " (Loki unavailable — falling back to in-process ring buffer)"}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed">
          {error.value && <div className="px-3 py-3 text-red-400">Error: {error.value}</div>}
          {!error.value && lines.value.length === 0 && !isLoading.value && (
            <div className="px-3 py-3 text-gray-500">No matching log lines.</div>
          )}
          <ul className="divide-y divide-gray-900/60">
            {lines.value.map((l) => (
              <li
                key={`${l.ts}-${l.service}-${l.message}`}
                className="px-3 py-1.5 hover:bg-gray-900/40 grid grid-cols-[6.5rem_5rem_5rem_1fr] gap-2"
                data-testid="logs-row"
              >
                <span className="text-gray-500 tabular-nums">{fmtTime(l.ts)}</span>
                <span className="text-gray-400 truncate">{l.service}</span>
                <span className={`uppercase ${LEVEL_COLOURS[l.level] ?? "text-gray-300"}`}>
                  {l.level}
                </span>
                <span className="text-gray-200 break-words">{l.message}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}
