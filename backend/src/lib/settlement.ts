import type { Desk } from "@veta/primitives";
import { isHoliday } from "@veta/trading-calendar";
import { SIFMA_BOND_CALENDAR, US_EQUITY_CALENDAR } from "@veta/market-calendars";

export type { Desk } from "@veta/primitives";

const SETTLEMENT_DAYS: Record<Desk, number> = {
  equity: 2,
  fi: 1,
  derivatives: 1,
  fx: 2,
  commodities: 2,
};

function calendarForDesk(desk: Desk) {
  return desk === "fi" ? SIFMA_BOND_CALENDAR : US_EQUITY_CALENDAR;
}

export function settlementDate(desk: Desk = "equity", fromMs = Date.now()): string {
  const days = SETTLEMENT_DAYS[desk];
  const calendar = calendarForDesk(desk);
  if (days === 0) return new Date(fromMs).toISOString().slice(0, 10);

  const d = new Date(fromMs);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !isHoliday(calendar, dateStr)) added++;
  }
  return d.toISOString().slice(0, 10);
}
