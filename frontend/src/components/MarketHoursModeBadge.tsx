import {
  type MarketHoursMode,
  marketHoursMode,
  marketHoursModeDetail,
} from "@veta/frontend/domain/market/marketHoursMode.ts";
import { useGetMarketHoursModeQuery } from "@veta/frontend/store/gatewayApi.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";

const MODE_STYLES: Record<MarketHoursMode, { label: string; summary: string; cls: string }> = {
  real: {
    label: "Real hours",
    summary: "Prices tick only while each market is really open.",
    cls: "bg-semantic-status-success/6 text-semantic-status-success border-semantic-status-success/30",
  },
  simulated: {
    label: "Simulated hours",
    summary: "Prices tick around the clock, including when real markets are closed.",
    cls: "bg-semantic-status-pending/6 text-semantic-status-pending border-semantic-status-pending/30",
  },
  mixed: {
    label: "Mixed hours",
    summary: "Some asset classes follow real hours; others tick around the clock.",
    cls: "bg-semantic-status-pending/6 text-semantic-status-pending border-semantic-status-pending/30",
  },
};

const POLL_INTERVAL_MS = 60_000;

export function MarketHoursModeBadge() {
  const signedIn = useAppSelector((s) => s.auth.user !== null);
  const { data } = useGetMarketHoursModeQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skip: !signedIn,
  });
  if (!data) return null;
  const mode = marketHoursMode(data);
  const style = MODE_STYLES[mode];
  const title = [style.summary, "", ...marketHoursModeDetail(data)].join("\n");
  return (
    <span
      data-testid="market-hours-mode-badge"
      data-mode={mode}
      title={title}
      className={`flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${style.cls}`}
    >
      {style.label}
    </span>
  );
}
