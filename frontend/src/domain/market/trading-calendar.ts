import type { MarketPhase } from "./market-session";

export interface MarketHours {
  preOpenMinutes: number;
  openingAuctionMinutes: number;
  continuousMinutes: number;
  closingAuctionMinutes: number;
  postCloseMinutes: number;
}

export interface TradingCalendar {
  exchangeMic: string;
  timezone: string;
  openHour: number;
  openMinute: number;
  hours: MarketHours;
  holidays: string[];
  earlyCloses: Record<string, { closingAuctionStartMinute: number }>;
}

export const US_EQUITY_CALENDAR: TradingCalendar = {
  exchangeMic: "XNAS",
  timezone: "America/New_York",
  openHour: 9,
  openMinute: 30,
  hours: {
    preOpenMinutes: 5,
    openingAuctionMinutes: 5,
    continuousMinutes: 370,
    closingAuctionMinutes: 5,
    postCloseMinutes: 5,
  },
  holidays: [
    "2026-01-01",
    "2026-01-19",
    "2026-02-16",
    "2026-04-03",
    "2026-05-25",
    "2026-07-03",
    "2026-09-07",
    "2026-11-26",
    "2026-12-25",
  ],
  earlyCloses: {
    "2026-11-27": { closingAuctionStartMinute: 195 },
    "2026-12-24": { closingAuctionStartMinute: 195 },
  },
};

export interface SessionScheduleEntry {
  phase: MarketPhase;
  startMinute: number;
  endMinute: number;
}

export function buildSessionSchedule(
  calendar: TradingCalendar,
  date?: string
): SessionScheduleEntry[] {
  const { hours } = calendar;
  const earlyClose = date ? calendar.earlyCloses[date] : undefined;

  let minute = 0;
  const schedule: SessionScheduleEntry[] = [];

  schedule.push({
    phase: "PRE_OPEN",
    startMinute: minute,
    endMinute: minute + hours.preOpenMinutes,
  });
  minute += hours.preOpenMinutes;

  schedule.push({
    phase: "OPENING_AUCTION",
    startMinute: minute,
    endMinute: minute + hours.openingAuctionMinutes,
  });
  minute += hours.openingAuctionMinutes;

  const continuousEnd = earlyClose
    ? earlyClose.closingAuctionStartMinute
    : minute + hours.continuousMinutes;
  schedule.push({ phase: "CONTINUOUS", startMinute: minute, endMinute: continuousEnd });
  minute = continuousEnd;

  schedule.push({
    phase: "CLOSING_AUCTION",
    startMinute: minute,
    endMinute: minute + hours.closingAuctionMinutes,
  });
  minute += hours.closingAuctionMinutes;

  schedule.push({
    phase: "CLOSED",
    startMinute: minute,
    endMinute: minute + hours.postCloseMinutes,
  });

  return schedule;
}

export function resolvePhaseFromMinute(
  schedule: SessionScheduleEntry[],
  marketMinute: number
): MarketPhase {
  for (const entry of schedule) {
    if (marketMinute >= entry.startMinute && marketMinute < entry.endMinute) {
      return entry.phase;
    }
  }
  return "CLOSED";
}

export function isHoliday(calendar: TradingCalendar, dateStr: string): boolean {
  return calendar.holidays.includes(dateStr);
}

export function isEarlyClose(calendar: TradingCalendar, dateStr: string): boolean {
  return dateStr in calendar.earlyCloses;
}

export function totalTradingMinutes(calendar: TradingCalendar, date?: string): number {
  const schedule = buildSessionSchedule(calendar, date);
  const last = schedule[schedule.length - 1];
  return last.endMinute;
}
