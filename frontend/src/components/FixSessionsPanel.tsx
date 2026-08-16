import { useGetFixExecutionsQuery, useGetFixSessionsQuery } from "@veta/frontend/store/fixApi.ts";
import { formatTime } from "@veta/frontend/utils/format.ts";
import { PopOutButton } from "./PopOutButton.tsx";

function ageString(connectedAt: number): string {
  const secs = Math.floor((Date.now() - connectedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

const ORD_STATUS_LABELS: Record<string, string> = {
  "0": "New",
  "1": "Partial",
  "2": "Filled",
  "4": "Canceled",
  "8": "Rejected",
};

function ordStatusLabel(code: string): string {
  return ORD_STATUS_LABELS[code] ?? code;
}

function SessionsSection() {
  const { data, isLoading } = useGetFixSessionsQuery(undefined, { pollingInterval: 5_000 });
  const sessions = data?.sessions ?? [];

  return (
    <div className="border-b border-panel shrink-0">
      <div className="px-3 py-1.5 text-[10px] font-semibold text-label uppercase tracking-wider">
        Sessions
      </div>
      {isLoading && sessions.length === 0 ? (
        <div className="px-3 pb-2 text-muted">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="px-3 pb-2 text-muted">No FIX sessions connected</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-muted text-left text-[10px] uppercase tracking-wider">
              <th className="px-3 py-1">Counterparty</th>
              <th className="px-3 py-1">State</th>
              <th className="px-3 py-1 text-right">Open orders</th>
              <th className="px-3 py-1 text-right">Connected</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const active = s.state === "ACTIVE";
              return (
                <tr key={s.remote} className="border-t border-panel/30">
                  <td className="px-3 py-1 text-secondary font-mono">
                    {s.counterparty ?? <span className="text-subtle">(pending logon)</span>}
                  </td>
                  <td className="px-3 py-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          active ? "bg-green-500" : "bg-amber-500"
                        }`}
                      />
                      <span className={active ? "text-green-400" : "text-amber-400"}>
                        {s.state}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums text-label">{s.openOrders}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-muted text-[10px]">
                    {ageString(s.connectedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExecutionsSection() {
  const { data: executions = [], isLoading } = useGetFixExecutionsQuery(
    { limit: 50 },
    { pollingInterval: 5_000 }
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-1.5 text-[10px] font-semibold text-label uppercase tracking-wider shrink-0">
        Recent executions
      </div>
      {isLoading && executions.length === 0 ? (
        <div className="px-3 text-muted">Loading…</div>
      ) : executions.length === 0 ? (
        <div className="px-3 text-muted">No FIX executions recorded</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-surface/95 backdrop-blur">
              <tr className="text-muted text-left text-[10px] uppercase tracking-wider">
                <th className="px-3 py-1">Time</th>
                <th className="px-3 py-1">Symbol</th>
                <th className="px-3 py-1">Side</th>
                <th className="px-3 py-1">Status</th>
                <th className="px-3 py-1 text-right">Cum qty</th>
                <th className="px-3 py-1 text-right">Avg px</th>
                <th className="px-3 py-1">Counterparty</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.execId} className="border-t border-panel/30">
                  <td className="px-3 py-1 text-muted tabular-nums text-[10px]">
                    {formatTime(e.ts)}
                  </td>
                  <td className="px-3 py-1 text-secondary font-semibold">{e.symbol}</td>
                  <td
                    className={`px-3 py-1 font-semibold ${
                      e.side === "1" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {e.side === "1" ? "BUY" : e.side === "2" ? "SELL" : e.side}
                  </td>
                  <td className="px-3 py-1 text-label">{ordStatusLabel(e.ordStatus)}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-default">{e.cumQty}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-default">
                    {e.avgPx > 0 ? e.avgPx.toFixed(4) : "—"}
                  </td>
                  <td className="px-3 py-1 text-muted font-mono text-[10px]">
                    {e.counterparty ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FixSessionsPanel() {
  return (
    <div className="flex flex-col h-full bg-page text-default text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel shrink-0">
        <span className="text-label font-medium uppercase tracking-wider">FIX Sessions</span>
        <PopOutButton panelId="fix-sessions" />
      </div>
      <SessionsSection />
      <ExecutionsSection />
    </div>
  );
}
