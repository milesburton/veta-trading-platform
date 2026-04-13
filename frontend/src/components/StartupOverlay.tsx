import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";

interface ReadyServices {
  marketSim: boolean;
  journal: boolean;
  userService: boolean;
  bus: boolean;
  ems?: boolean;
  oms?: boolean;
  analytics?: boolean;
  marketData?: boolean;
  featureEngine?: boolean;
  signalEngine?: boolean;
  recommendationEngine?: boolean;
  scenarioEngine?: boolean;
  llmAdvisory?: boolean;
  gateway?: boolean;
}

interface ReadyResponse {
  ready: boolean;
  startedAt?: number;
  services: ReadyServices;
}

// How long after gateway startedAt we consider the platform to still be "booting"
const BOOTING_WINDOW_MS = 120_000;

export const SERVICE_LABELS: Record<keyof ReadyServices, string> = {
  gateway: "Gateway (BFF)",
  bus: "Message Bus",
  marketSim: "Market Simulator",
  userService: "User Service",
  journal: "Trade Journal",
  ems: "Execution Engine",
  oms: "Order Manager",
  analytics: "Analytics",
  marketData: "Market Data",
  featureEngine: "Feature Engine",
  signalEngine: "Signal Engine",
  recommendationEngine: "Recommendation Engine",
  scenarioEngine: "Scenario Engine",
  llmAdvisory: "LLM Advisory",
};

export const SERVICE_DESCRIPTIONS: Record<keyof ReadyServices, string> = {
  gateway: "Single entry point for the UI — proxies HTTP and WebSocket to all backend services",
  bus: "Redpanda message bus — event streaming backbone for all inter-service communication",
  marketSim: "Simulates live equity prices using Geometric Brownian Motion",
  userService: "Session management, authentication and per-user trading limits",
  journal: "Persistent store for orders, fills and OHLCV candlestick data",
  ems: "Routes child orders to the exchange and records execution fills",
  oms: "Validates orders against RBAC limits and routes to the correct strategy",
  analytics: "Black-Scholes option pricing, Monte Carlo scenario grid and trade recommendations",
  marketData: "Polls Alpha Vantage for real prices and applies per-symbol source overrides",
  featureEngine: "Computes technical indicators (RSI, Bollinger, MACD) from market data streams",
  signalEngine: "Generates directional buy/sell signals from feature vectors",
  recommendationEngine: "Combines signals into ranked trade recommendations for the UI",
  scenarioEngine: "Runs what-if simulations against the current portfolio and market state",
  llmAdvisory: "LLM-powered trade commentary and natural-language market insights",
};

const SERVICE_ORDER: (keyof ReadyServices)[] = [
  "gateway",
  "bus",
  "marketSim",
  "userService",
  "journal",
  "ems",
  "oms",
  "analytics",
  "marketData",
  "featureEngine",
  "signalEngine",
  "recommendationEngine",
  "scenarioEngine",
  "llmAdvisory",
];

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
            services.value = { ...services.value, gateway: false } as ReadyServices;
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

  const upCount = SERVICE_ORDER.filter((k) => services.value?.[k]).length;
  const totalCount = SERVICE_ORDER.length;

  const isBooting = mode.value === "booting";

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
            {isBooting ? "Starting up" : "Waiting for services to respond"}
          </div>
          <div className="text-xs text-gray-600">
            {isBooting
              ? "Initialising trading services — usually takes 30–60 seconds"
              : "Platform is running — some services are not yet responding"}
          </div>
        </div>
      </div>

      {/* Service checklist */}
      <table className="border-collapse text-sm">
        <tbody>
          {SERVICE_ORDER.map((key) => {
            const up = services.value?.[key];
            return (
              <tr key={key} data-testid={`service-indicator-${key}`}>
                <td className="pr-3 py-0.5 align-middle">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      up ? "bg-emerald-400" : "bg-gray-600 animate-pulse"
                    }`}
                  />
                </td>
                <td
                  className={`pr-6 py-0.5 align-middle whitespace-nowrap ${
                    up ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {SERVICE_LABELS[key]}
                </td>
                <td className="py-0.5 align-middle text-[11px] text-gray-600 max-w-sm">
                  {SERVICE_DESCRIPTIONS[key]}
                </td>
                <td className="pl-4 py-0.5 align-middle text-[10px] text-gray-600 whitespace-nowrap">
                  {up ? "ready" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Progress summary */}
      <div className="text-xs text-gray-600">
        {upCount} / {totalCount} services ready
      </div>

      <div data-testid="startup-elapsed" className="text-xs text-gray-600 tabular-nums">
        {timeStr} elapsed
      </div>

      <div
        data-testid="startup-build-info"
        className="flex items-center justify-between w-full px-6 py-2 text-[10px] text-gray-700 tabular-nums border-t border-gray-800/50"
      >
        <span>VETA &middot; Miles Burton</span>
        <span className="flex items-center gap-3">
          {commitSha && <span>v{commitSha}</span>}
          {!commitSha && buildDate && <span>{buildDate}</span>}
          <a
            href="https://github.com/milesburton/veta-trading-platform"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-gray-400 transition-colors"
          >
            GitHub
          </a>
        </span>
      </div>
    </div>
  );
}
