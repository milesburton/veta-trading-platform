import { calendarForOrder } from "@veta/market-calendars";
import { resolveCurrentSession } from "@veta/trading-calendar";

// "derivatives" deliberately maps to no assetClass: options are gated by
// their underlying equity's calendar, which is calendarForOrder's default
// fallback when assetClass/exchange don't match anything more specific.
const DESK_ASSET_CLASS: Partial<Record<string, string>> = {
  fx: "fx",
  fi: "bond",
  commodities: "commodity",
};

export function isDeskOpen(desk: string | undefined, now: Date): boolean {
  const calendar = calendarForOrder({ assetClass: desk ? DESK_ASSET_CLASS[desk] : undefined });
  return resolveCurrentSession(calendar, now).allowsOrderEntry;
}
