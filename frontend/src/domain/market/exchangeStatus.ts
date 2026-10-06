import type { MarketHoursConfig } from "@veta/frontend/store/gatewayApi.ts";
import type { AssetDef } from "@veta/frontend/types.ts";

const EXCHANGE_LABELS: Record<string, string> = {
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  ARCX: "ARCA",
  XCHI: "CHX",
  XCME: "CME",
  XNYM: "NYMEX",
  XCBT: "CBOT",
};

export interface ExchangeStatus {
  label: string;
  mic: string;
  isOpen: boolean;
  phase: string;
}

export function exchangeLabel(mic: string): string {
  return EXCHANGE_LABELS[mic] ?? mic;
}

export function exchangeStatus(
  asset: Pick<AssetDef, "exchange" | "assetClass">,
  config: MarketHoursConfig
): ExchangeStatus | null {
  const session = config.assetClasses[asset.assetClass ?? "equity"];
  const mic = asset.exchange ?? session.calendarLabel;
  if (!mic) return null;
  return { label: exchangeLabel(mic), mic, isOpen: session.isOpen, phase: session.phase };
}
