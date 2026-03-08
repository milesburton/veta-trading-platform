import { useEffect, useRef, useState } from "react";

interface ReadyResponse {
  ready: boolean;
  services: {
    marketSim: boolean;
    journal: boolean;
    userService: boolean;
    bus: boolean;
  };
}

const SERVICE_LABELS: Record<keyof ReadyResponse["services"], string> = {
  marketSim: "Market Simulator",
  journal: "Trade Journal",
  userService: "User Service",
  bus: "Message Bus",
};

const POLL_INTERVAL_MS = 2_000;

export function StartupOverlay({ onReady }: { onReady: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [services, setServices] = useState<ReadyResponse["services"] | null>(null);
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
            setServices(data.services);
            if (data.ready) {
              onReadyRef.current();
              return;
            }
          }
        } catch {
          // gateway not yet reachable — keep polling
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

  return (
    <div
      data-testid="startup-overlay"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 gap-6"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <div data-testid="brand-title" className="text-4xl font-bold text-white tracking-tight">
            Veta
          </div>
          <div className="text-xs font-medium text-emerald-500 tracking-widest uppercase">
            Equities Trading Simulator
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

      <div className="flex flex-col gap-2 min-w-52">
        {(Object.keys(SERVICE_LABELS) as Array<keyof ReadyResponse["services"]>).map((key) => {
          const up = services?.[key] ?? false;
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
            </div>
          );
        })}
      </div>

      <div data-testid="startup-elapsed" className="text-xs text-gray-600 tabular-nums">
        {timeStr} elapsed
      </div>
    </div>
  );
}
