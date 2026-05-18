import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { BuildInfo } from "./BuildInfo.tsx";
import { catalogEntry, STARTUP_SERVICE_KEYS } from "./StartupOverlay/serviceCatalog.ts";

type ReadyServices = Record<string, boolean | undefined>;

interface ReadyResponse {
  ready: boolean;
  startedAt?: number;
  services: ReadyServices;
}

const BOOTING_WINDOW_MS = 120_000;

function orderServiceKeys(keys: string[]): string[] {
  const known = STARTUP_SERVICE_KEYS.filter((k) => keys.includes(k));
  const extras = keys.filter((k) => !STARTUP_SERVICE_KEYS.includes(k)).sort();
  return [...known, ...extras];
}

const POLL_INTERVAL_MS = 2_000;

interface Props {
  onReady: () => void;
  buildDate?: string;
  commitSha?: string;
}

type OverlayMode = "booting" | "waiting";

export function StartupOverlay({ onReady, buildDate, commitSha }: Props) {
  const elapsed = useSignal(0);
  const services = useSignal<ReadyServices | null>(null);
  const mode = useSignal<OverlayMode>("booting");

  // startRef anchors the timer. Updated to gateway's startedAt on first poll.
  const startRef = useRef(Date.now());
  const anchoredRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const clock = setInterval(() => {
      if (!anchoredRef.current) return;
      elapsed.value = Math.floor((Date.now() - startRef.current) / 1000);
    }, 1_000);
    return () => clearInterval(clock);
  }, [elapsed]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const gatewayBase = import.meta.env.VITE_GATEWAY_URL ?? "/api/gateway";
          const res = await fetch(`${gatewayBase}/ready`);
          if (!cancelled && res.ok) {
            const data: ReadyResponse = await res.json();

            if (!anchoredRef.current && data.startedAt) {
              startRef.current = data.startedAt;
              anchoredRef.current = true;
              // If the gateway has been running for more than BOOTING_WINDOW_MS,
              // this is a refresh on an already-running platform — show "waiting" mode.
              const age = Date.now() - data.startedAt;
              mode.value = age > BOOTING_WINDOW_MS ? "waiting" : "booting";
            }

            services.value = { gateway: true, ...data.services };

            if (data.ready) {
              onReadyRef.current();
              return;
            }
          }
        } catch {
          if (!cancelled) {
            services.value = {
              ...services.value,
              gateway: false,
            } as ReadyServices;
          }
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [services, mode]);

  const mins = Math.floor(elapsed.value / 60);
  const secs = elapsed.value % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const reportedKeys = Object.keys(services.value ?? {});
  const orderedKeys =
    reportedKeys.length > 0 ? orderServiceKeys(reportedKeys) : STARTUP_SERVICE_KEYS.slice();
  const upCount = orderedKeys.filter((k) => services.value?.[k]).length;
  const totalCount = orderedKeys.length;

  const isBooting = mode.value === "booting";

  return (
    <div data-testid="startup-overlay" className="fixed inset-0 z-50 flex flex-col bg-page">
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div
                data-testid="brand-title"
                className="text-4xl font-bold text-primary tracking-tight"
              >
                VETA
              </div>
              <div className="text-xs font-medium text-emerald-400 tracking-widest uppercase">
                Trading Platform
              </div>
            </div>
            <div className="h-6 w-px bg-divider" />
            <div className="flex flex-col items-center gap-1">
              <div data-testid="startup-status" className="text-sm font-medium text-secondary">
                {isBooting ? "Starting up" : "Waiting for services to respond"}
              </div>
              <div className="text-xs text-label">
                {isBooting
                  ? "Initialising trading services — usually takes 30–60 seconds"
                  : "Platform is running — some services are not yet responding"}
              </div>
              {/* Build info is shown once in the footer — see <BuildInfo /> below. */}
            </div>
          </div>

          {/* Service checklist */}
          <div className="mt-6 overflow-x-auto rounded-lg border border-panel bg-surface/65 p-4 sm:p-5">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {orderedKeys.map((key) => {
                  const up = services.value?.[key];
                  const entry = catalogEntry(key);
                  return (
                    <tr key={key} data-testid={`service-indicator-${key}`}>
                      <td className="w-6 pr-3 py-0.5 align-middle">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            up ? "bg-emerald-400" : "bg-subtle animate-pulse"
                          }`}
                        />
                      </td>
                      <td
                        className={`pr-6 py-0.5 align-middle whitespace-nowrap font-medium ${
                          up ? "text-secondary" : "text-muted"
                        }`}
                      >
                        {entry.label}
                      </td>
                      <td className="py-0.5 align-middle text-[11px] text-label">
                        {entry.description}
                      </td>
                      <td className="pl-4 py-0.5 align-middle text-[10px] text-muted whitespace-nowrap">
                        {up ? "ready" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Progress summary */}
          <div className="mt-6 flex flex-col items-center gap-2 text-label">
            <div className="text-xs">
              {upCount} / {totalCount} services ready
            </div>
            <div data-testid="startup-elapsed" className="text-xs tabular-nums text-muted">
              {timeStr} elapsed
            </div>
          </div>
        </div>
      </div>

      <div data-testid="startup-build-info" className="w-full border-t border-panel/60 bg-page/95">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-2 text-[9px] text-subtle tabular-nums sm:text-[10px]">
          <span className="whitespace-nowrap">VETA &middot; Miles Burton</span>
          <span className="flex items-center gap-3">
            <BuildInfo
              buildDate={buildDate}
              commitSha={commitSha}
              version={import.meta.env.VITE_APP_VERSION}
              className="text-[10px] text-subtle tabular-nums"
            />
            <a
              href="https://github.com/milesburton/veta-trading-platform"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-default transition-colors"
            >
              GitHub
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
