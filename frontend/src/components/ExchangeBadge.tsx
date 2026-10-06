import {
  type ExchangeStatus,
  exchangeStatus,
} from "@veta/frontend/domain/market/exchangeStatus.ts";
import { useGetMarketHoursModeQuery } from "@veta/frontend/store/gatewayApi.ts";
import { useAppSelector } from "@veta/frontend/store/hooks.ts";

const POLL_INTERVAL_MS = 60_000;

export function useExchangeStatus(symbol: string): ExchangeStatus | null {
  const signedIn = useAppSelector((s) => s.auth.user !== null);
  const asset = useAppSelector((s) => s.market.assets.find((a) => a.symbol === symbol));
  const { data } = useGetMarketHoursModeQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skip: !signedIn,
  });
  if (!asset || !data) return null;
  return exchangeStatus(asset, data);
}

export function ExchangeBadge({ symbol }: { symbol: string }) {
  const status = useExchangeStatus(symbol);
  if (!status) return null;
  const state = status.isOpen ? "open" : "closed";
  return (
    <span
      data-testid={`exchange-badge-${symbol}`}
      data-state={state}
      title={`${status.mic}: ${status.phase} (real session ${state})`}
      className={`ml-1 text-[9px] font-normal tracking-wide ${
        status.isOpen ? "text-secondary" : "text-muted line-through"
      }`}
    >
      {status.label}
      <span className="sr-only">{`, market ${state}`}</span>
    </span>
  );
}
