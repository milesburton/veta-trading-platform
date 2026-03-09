import { useEffect, useRef, useState } from "react";

interface ReadyServices {
  marketSim: boolean;
  journal: boolean;
  userService: boolean;
  bus: boolean;
  ems?: boolean;
  oms?: boolean;
  gateway?: boolean;
}

interface ReadyResponse {
  ready: boolean;
  services: ReadyServices;
}

const SERVICE_LABELS: Record<keyof ReadyServices, string> = {
  gateway: "Gateway (BFF)",
  bus: "Message Bus",
  marketSim: "Market Simulator",
  userService: "User Service",
  journal: "Trade Journal",
  ems: "Execution Engine",
  oms: "Order Manager",
};

// Display order — gateway + bus first (infrastructure), then trading services
const SERVICE_ORDER: (keyof ReadyServices)[] = [
  "gateway",
  "bus",
  "marketSim",
  "userService",
  "journal",
  "ems",
  "oms",
];

const POLL_INTERVAL_MS = 2_000;

interface Props {
  onReady: () => void;
  buildDate?: string;
  commitSha?: string;
}

export function StartupOverlay({ onReady, buildDate, commitSha }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [services, setServices] = useState<ReadyServices | null>(null);
  const startRef = useRef(Date.now());
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const clock = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1_000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/gateway/ready");
          if (!cancelled && res.ok) {
            const data: ReadyResponse = await res.json();
            // Merge gateway itself as "up" since we got a response
            setServices({ gateway: true, ...data.services });
            if (data.ready) {
              onReadyRef.current();
              return;
            }
          }
        } catch {
          // gateway not yet reachable — keep polling; mark gateway as down
          if (!cancelled) {
            setServices((prev) => ({ ...prev, gateway: false }) as ReadyServices);
          }
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Count how many known services are up
  const knownKeys = SERVICE_ORDER.filter((k) => services !== null && k in services);
  const upCount = knownKeys.filter((k) => services?.[k]).length;
  const totalCount = knownKeys.length;

  return (
    <div
      data-testid="startup-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 gap-6"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div
            data-testid="brand-title"
            className="text-4xl font-bold text-gray-100 tracking-tight"
          >
            VETA
          </div>
          <div className="text-xs font-medium text-emerald-500 tracking-widest uppercase">
            Trading Platform
          </div>
        </div>
        <div className="w-px h-6 bg-gray-800" />
        <div className="flex flex-col items-center gap-1">
          <div data-testid="startup-status" className="text-sm font-medium text-gray-300">
            Starting up
          </div>
          <div className="text-xs text-gray-600">
            Initialising trading services — usually takes 30–60 seconds
          </div>
        </div>
      </div>

      {/* Service checklist */}
      <div className="flex flex-col gap-1.5 min-w-64">
        {SERVICE_ORDER.map((key) => {
          const up = services?.[key];
          return (
            <div
              key={key}
              data-testid={`service-indicator-${key}`}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  up ? "bg-emerald-400" : "bg-gray-600 animate-pulse"
                }`}
              />
              <span className={up ? "text-gray-300" : "text-gray-500"}>{SERVICE_LABELS[key]}</span>
              {up && <span className="ml-auto text-[10px] text-gray-600">ready</span>}
            </div>
          );
        })}
      </div>

      {/* Progress summary */}
      {services !== null && totalCount > 0 && (
        <div className="text-xs text-gray-600">
          {upCount} / {totalCount} services ready
        </div>
      )}

      <div data-testid="startup-elapsed" className="text-xs text-gray-600 tabular-nums">
        {timeStr} elapsed
      </div>

      <div data-testid="startup-build-info" className="text-[10px] text-gray-700 tabular-nums">
        {buildDate && <span>{buildDate}</span>}
        {buildDate && commitSha && <span className="mx-1">·</span>}
        {commitSha && <span>{commitSha}</span>}
      </div>
    </div>
  );
}
