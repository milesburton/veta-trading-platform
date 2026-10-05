import type { MarketHoursAssetClass, MarketHoursConfig } from "@veta/frontend/store/gatewayApi.ts";

export type MarketHoursMode = "real" | "simulated" | "mixed";

const ASSET_CLASS_LABELS: Record<MarketHoursAssetClass, string> = {
  equity: "Equities",
  fx: "FX",
  commodity: "Commodities",
  bond: "Bonds",
};

export function marketHoursMode(config: MarketHoursConfig): MarketHoursMode {
  const overrides = Object.values(config.assetClasses).map((ac) => ac.allowOutOfHoursOverride);
  if (overrides.every(Boolean)) return "simulated";
  if (overrides.some(Boolean)) return "mixed";
  return "real";
}

export function marketHoursModeDetail(config: MarketHoursConfig): string[] {
  return (Object.keys(ASSET_CLASS_LABELS) as MarketHoursAssetClass[]).map((ac) => {
    const entry = config.assetClasses[ac];
    const session = entry.isOpen ? "open" : "closed";
    const ticking = entry.allowOutOfHoursOverride
      ? "simulated, ticks around the clock"
      : "follows real hours";
    return `${ASSET_CLASS_LABELS[ac]} (${entry.calendarLabel}): real session ${session}, ${ticking}`;
  });
}
