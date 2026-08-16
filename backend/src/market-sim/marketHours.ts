import { US_EQUITY_CALENDAR } from "@veta/market-calendars";
import { resolveCurrentSession } from "@veta/trading-calendar";

const NEW_YORK_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Delegates to the shared, holiday-aware @veta/trading-calendar rather than
// a hand-rolled weekday/09:30-16:00 check, so this stays in sync with the
// same calendar deskCalendar.ts (synthetic-trader) already uses.
export function isUsEquityRegularSession(now = new Date()): boolean {
  const parts = Object.fromEntries(
    NEW_YORK_CLOCK.formatToParts(now).map((part) => [part.type, part.value])
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  return resolveCurrentSession(US_EQUITY_CALENDAR, now).allowsOrderEntry;
}

export function parseAllowOutOfHours(value: string | undefined): boolean {
  if (value === undefined) return true;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
