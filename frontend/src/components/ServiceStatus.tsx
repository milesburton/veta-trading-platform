import { useSignal } from "@preact/signals-react";
import type { ServiceHealth, ServiceState } from "@veta/frontend/types.ts";
import { ServiceRow } from "./ServiceRow";
import { StatusDot } from "./StatusDot";

interface Props {
  services: ServiceHealth[];
}

function aggregateState(services: ServiceHealth[]): ServiceState {
  const required = services.filter((s) => !s.optional);
  if (required.some((s) => s.state === "error")) return "error";
  if (required.some((s) => s.state === "unknown")) return "unknown";
  return "ok";
}

/** Returns { consistent: true, version } if all healthy required services share one version. */
function versionSummary(services: ServiceHealth[]): {
  consistent: boolean;
  version: string | null;
  lastChecked: number | null;
} {
  const checked = services.filter((s) => !s.optional && s.state === "ok" && s.version !== "—");
  const versions = [...new Set(checked.map((s) => s.version))];
  const lastChecked = checked.reduce<number | null>((max, s) => {
    if (s.lastChecked === null) return max;
    return max === null ? s.lastChecked : Math.max(max, s.lastChecked);
  }, null);
  if (versions.length === 0) {
    return { consistent: false, version: null, lastChecked };
  }
  if (versions.length === 1) {
    return { consistent: true, version: versions[0], lastChecked };
  }
  return { consistent: false, version: null, lastChecked };
}

export function ServiceStatus({ services }: Props) {
  const open = useSignal(false);
  const overall = aggregateState(services);
  const { consistent, version, lastChecked } = versionSummary(services);

  const okCount = services.filter((s) => s.state === "ok").length;
  const totalCount = services.length;

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="services-status-btn"
        onClick={() => {
          open.value = !open.value;
        }}
        className="flex items-center gap-1.5 text-xs text-label hover:text-secondary transition-colors"
      >
        <StatusDot state={overall} className="w-2 h-2" />
        <span>
          Services{" "}
          <span className="tabular-nums text-muted">
            {okCount}/{totalCount}
          </span>
          {consistent && version && (
            <span className="ml-1 font-mono text-muted" title={`All services on v${version}`}>
              v{version.length > 8 ? `${version.slice(0, 7)}…` : version}
            </span>
          )}
        </span>
      </button>

      {open.value && (
        <>
          <button
            type="button"
            aria-label="Close service status panel"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              open.value = false;
            }}
          />

          <div className="absolute right-0 top-7 z-20 w-[28rem] bg-surface border border-divider rounded shadow-xl text-xs">
            <div className="px-3 py-2 border-b border-divider flex items-center justify-between min-h-[2.75rem]">
              <span className="font-semibold text-default uppercase tracking-wider">
                Service Health
              </span>
              <div className="flex flex-col items-end gap-0.5 min-w-[9rem]">
                <span className="font-mono h-[1.1em]">
                  {consistent && version ? (
                    <span className="text-emerald-400">v{version}</span>
                  ) : (
                    <span className="text-amber-400">
                      {version === null && services.every((s) => s.state === "unknown")
                        ? "loading…"
                        : "version mismatch"}
                    </span>
                  )}
                </span>
                <span className="text-subtle h-[1.1em] tabular-nums">
                  {lastChecked
                    ? `checked ${new Date(lastChecked).toLocaleTimeString()}`
                    : "polls every 10s"}
                </span>
              </div>
            </div>

            {okCount === 0 && (
              <div className="px-3 py-2 border-b border-panel bg-page text-muted text-[11px]">
                No services responding. Start the backend:{" "}
                <span className="font-mono text-label">supervisorctl start all</span>
              </div>
            )}

            <table className="w-full table-fixed">
              <thead>
                <tr className="text-muted border-b border-panel">
                  <th className="text-left px-3 py-2 w-[33%]" title="Backend service name">
                    Service
                  </th>
                  <th className="text-left px-3 py-2 w-[14%]" title="Current health state">
                    Status
                  </th>
                  <th className="text-left px-3 py-2 w-[23%]" title="Reported service version">
                    Version
                  </th>
                  <th className="text-left px-3 py-2 w-[30%]" title="Additional service metadata">
                    Info
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => (
                  <ServiceRow key={svc.name} svc={svc} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
