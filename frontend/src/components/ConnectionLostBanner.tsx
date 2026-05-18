import { useAppDispatch, useAppSelector } from "@veta/frontend/store/hooks.ts";
import { reconnectGateway } from "@veta/frontend/store/middleware/gatewayMiddleware.ts";

const SHOW_AFTER_FAILURES = 3;

export function ConnectionLostBanner() {
  const failures = useAppSelector((s) => s.market.connectionFailures);
  const connected = useAppSelector((s) => s.market.connected);
  const dispatch = useAppDispatch();

  if (connected || failures < SHOW_AFTER_FAILURES) return null;

  return (
    <div
      data-testid="connection-lost-banner"
      role="alert"
      className="flex items-center gap-3 px-4 py-2 bg-amber-950 border-b border-amber-800 text-sm text-amber-200 shrink-0"
    >
      <span aria-hidden="true" className="text-amber-400 font-bold shrink-0">
        ⚠
      </span>
      <span className="flex-1">
        Connection to the gateway has been lost. Live prices, order updates, and trade actions are
        paused. Reconnecting automatically — or click below to retry now.
      </span>
      <button
        type="button"
        data-testid="connection-lost-reconnect"
        onClick={() => dispatch(reconnectGateway())}
        className="shrink-0 px-3 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white text-[11px] font-semibold uppercase tracking-wide transition-colors"
      >
        Try reconnect
      </button>
      <button
        type="button"
        data-testid="connection-lost-reload"
        onClick={() => window.location.reload()}
        className="shrink-0 px-3 py-0.5 rounded border border-amber-700 hover:bg-amber-900/40 text-amber-200 text-[11px] font-semibold uppercase tracking-wide transition-colors"
      >
        Reload page
      </button>
    </div>
  );
}
