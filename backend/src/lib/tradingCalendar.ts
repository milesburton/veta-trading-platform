import type { Strategy } from "@veta/primitives";

export type MarketPhase =
  | "PRE_OPEN"
  | "OPENING_AUCTION"
  | "CONTINUOUS"
  | "CLOSING_AUCTION"
  | "HALTED"
  | "CLOSED";

export interface SessionState {
  phase: MarketPhase;
  allowsOrderEntry: boolean;
  allowsAmend: boolean;
  allowsCancel: boolean;
  supportedStrategies: Strategy[];
  phaseLabel: string;
  nextTransitionAt?: number;
}

const ALL_STRATEGIES: Strategy[] = [
  "LIMIT",
  "TWAP",
  "POV",
  "VWAP",
  "ICEBERG",
  "SNIPER",
  "ARRIVAL_PRICE",
  "IS",
  "MOMENTUM",
];

const AUCTION_STRATEGIES: Strategy[] = ["LIMIT"];

export function resolveSession(phase: MarketPhase, nextTransitionAt?: number): SessionState {
  switch (phase) {
    case "PRE_OPEN":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: AUCTION_STRATEGIES,
        phaseLabel: "Pre-Open",
        nextTransitionAt,
      };
    case "OPENING_AUCTION":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: AUCTION_STRATEGIES,
        phaseLabel: "Opening Auction",
        nextTransitionAt,
      };
    case "CONTINUOUS":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: true,
        allowsCancel: true,
        supportedStrategies: ALL_STRATEGIES,
        phaseLabel: "Continuous Trading",
        nextTransitionAt,
      };
    case "CLOSING_AUCTION":
      return {
        phase,
        allowsOrderEntry: true,
        allowsAmend: false,
        allowsCancel: true,
        supportedStrategies: AUCTION_STRATEGIES,
        phaseLabel: "Closing Auction",
        nextTransitionAt,
      };
    case "HALTED":
      return {
        phase,
        allowsOrderEntry: false,
        allowsAmend: false,
        allowsCancel: true,
        supportedStrategies: [],
        phaseLabel: "Trading Halted",
        nextTransitionAt,
      };
    case "CLOSED":
      return {
        phase,
        allowsOrderEntry: false,
        allowsAmend: false,
        allowsCancel: false,
        supportedStrategies: [],
        phaseLabel: "Market Closed",
        nextTransitionAt,
      };
  }
}

export function isStrategyAllowedInSession(session: SessionState, strategy: Strategy): boolean {
  return session.supportedStrategies.includes(strategy);
}

export function isAuction(phase: MarketPhase): boolean {
  return phase === "OPENING_AUCTION" || phase === "CLOSING_AUCTION";
}

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
  /**
   * Intraday halts that recur every trading day (e.g. a lunch break or a
   * daily maintenance window). Distinct from earlyCloses (a one-off date
   * where the session ends sooner) and holidays (the whole day is closed).
   */
  dailyBreaks?: { startMinute: number; endMinute: number }[];
}

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
  schedule.push({
    phase: "CONTINUOUS",
    startMinute: minute,
    endMinute: continuousEnd,
  });
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
  marketMinute: number,
  dailyBreaks?: TradingCalendar["dailyBreaks"]
): MarketPhase {
  if (dailyBreaks) {
    for (const b of dailyBreaks) {
      if (marketMinute >= b.startMinute && marketMinute < b.endMinute) {
        return "HALTED";
      }
    }
  }
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
