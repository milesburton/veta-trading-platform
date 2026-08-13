import { calendarForOrder } from "@veta/market-calendars";
import { resolveCurrentSession } from "@veta/trading-calendar";

export type AssetClass = "equity" | "fx" | "commodity" | "bond";
export const ASSET_CLASSES: AssetClass[] = ["equity", "fx", "commodity", "bond"];

export function isAssetClass(value: unknown): value is AssetClass {
  return ASSET_CLASSES.includes(value as AssetClass);
}

export function isAssetClassOpen(assetClass: AssetClass, now = new Date()): boolean {
  const calendar = calendarForOrder({ assetClass });
  return resolveCurrentSession(calendar, now).allowsOrderEntry;
}

export interface AssetClassMarketHours {
  calendarLabel: string;
  isOpen: boolean;
  phase: string;
  allowOutOfHoursOverride: boolean;
}

export function buildMarketHoursPayload(
  allowOutOfHours: Record<AssetClass, boolean>,
  now = new Date()
): { assetClasses: Record<AssetClass, AssetClassMarketHours> } {
  const assetClasses = {} as Record<AssetClass, AssetClassMarketHours>;
  for (const assetClass of ASSET_CLASSES) {
    const calendar = calendarForOrder({ assetClass });
    const session = resolveCurrentSession(calendar, now);
    assetClasses[assetClass] = {
      calendarLabel: calendar.exchangeMic,
      isOpen: session.allowsOrderEntry,
      phase: session.phaseLabel,
      allowOutOfHoursOverride: allowOutOfHours[assetClass],
    };
  }
  return { assetClasses };
}
