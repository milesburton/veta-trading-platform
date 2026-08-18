import type { TradingCalendar } from "@veta/trading-calendar";

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

// SIFMA recommended bond-market closures — deliberately diverges from the
// equity calendar: Columbus Day and Veterans Day are bond-market holidays
// but NOT equity holidays, so this cannot be derived from US_EQUITY_CALENDAR.
export const SIFMA_BOND_CALENDAR: TradingCalendar = {
  exchangeMic: "SIFMA",
  timezone: "America/New_York",
  openHour: 8,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 0,
    continuousMinutes: 540, // 08:00-17:00 ET
    closingAuctionMinutes: 0,
    postCloseMinutes: 0,
  },
  holidays: [
    "2026-01-01",
    "2026-01-19", // MLK Day
    "2026-02-16", // Presidents Day
    "2026-04-03", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-07-03", // Independence Day (observed)
    "2026-09-07", // Labor Day
    "2026-10-12", // Columbus Day (bond-only, not an equity holiday)
    "2026-11-11", // Veterans Day (bond-only, not an equity holiday)
    "2026-11-26", // Thanksgiving
    "2026-12-25",
  ],
  earlyCloses: {
    "2026-11-27": { closingAuctionStartMinute: 120 },
    "2026-12-24": { closingAuctionStartMinute: 120 },
  },
};

// CME/NYMEX-style near-24h trading with a daily maintenance break
// (16:00-17:00 CT). Distinct, shorter holiday list than equity — CME does
// not observe MLK Day, Presidents Day, or Columbus Day as full closures.
export const COMMODITY_CALENDAR: TradingCalendar = {
  exchangeMic: "XCME",
  timezone: "America/Chicago",
  openHour: 17,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 0,
    continuousMinutes: 1439, // effectively the full day around the daily break
    closingAuctionMinutes: 0,
    postCloseMinutes: 1,
  },
  holidays: ["2026-01-01", "2026-04-03", "2026-07-03", "2026-11-26", "2026-12-25"],
  earlyCloses: {},
  dailyBreaks: [{ startMinute: 1380, endMinute: 1439 }], // 16:00-17:00 CT
};

// FX trades ~24/5 with no single exchange calendar. Sun 22:00 UTC through
// Fri 22:00 UTC, modeled as continuous with reduced-liquidity windows
// (thin trading, not a full closure) around Christmas/New Year rather than
// a hard halt, since real FX venues stay technically open through the
// holiday period at much lower volume.
export const FX_CALENDAR: TradingCalendar = {
  exchangeMic: "FX",
  timezone: "UTC",
  openHour: 22,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 0,
    continuousMinutes: 6960, // Sun 22:00 UTC -> Fri 22:00 UTC, in minutes
    closingAuctionMinutes: 0,
    postCloseMinutes: 1440, // Fri 22:00 UTC -> Sun 22:00 UTC weekend close
  },
  holidays: [],
  earlyCloses: {},
};

// Dates where FX is nominally open (order entry still allowed — real FX
// venues don't close for these) but liquidity is materially thinner around
// Christmas/New Year. Deliberately NOT modeled as a TradingCalendar halt —
// these aren't closures, so checkMarketHours must not reject orders on
// these dates. Consuming code that cares about liquidity (not just
// open/closed) should check this set directly.
export const FX_REDUCED_LIQUIDITY_DATES = new Set(["2026-12-24", "2026-12-25", "2026-01-01"]);

export const XLON_CALENDAR: TradingCalendar = {
  exchangeMic: "XLON",
  timezone: "Europe/London",
  openHour: 8,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 5,
    continuousMinutes: 505, // 08:00-16:30
    closingAuctionMinutes: 5,
    postCloseMinutes: 5,
  },
  holidays: [
    "2026-01-01",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-04", // Early May bank holiday
    "2026-05-25", // Spring bank holiday
    "2026-08-31", // Summer bank holiday
    "2026-12-25",
    "2026-12-28", // Boxing Day (substitute — Dec 26 falls on a Saturday)
  ],
  earlyCloses: {},
};

export const EURONEXT_CALENDAR: TradingCalendar = {
  exchangeMic: "XPAR", // also covers XAMS — same trading calendar
  timezone: "Europe/Paris",
  openHour: 9,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 0,
    continuousMinutes: 510, // 09:00-17:30 CET
    closingAuctionMinutes: 0,
    postCloseMinutes: 0,
  },
  holidays: [
    "2026-01-01",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-01", // Labour Day
    "2026-12-25",
    "2026-12-26", // Second Christmas Day
  ],
  earlyCloses: {},
};

export const XETR_CALENDAR: TradingCalendar = {
  exchangeMic: "XETR",
  timezone: "Europe/Berlin",
  openHour: 9,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 0,
    continuousMinutes: 510, // 09:00-17:30 CET
    closingAuctionMinutes: 0,
    postCloseMinutes: 0,
  },
  holidays: [
    "2026-01-01",
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-01", // Labour Day
    "2026-12-24", // Xetra observes a full closure, not a half day
    "2026-12-25",
    "2026-12-31",
  ],
  earlyCloses: {},
};

// Tokyo Stock Exchange — 09:00-11:30 morning session, lunch break
// 11:30-12:30, 12:30-15:00 afternoon session. The lunch break is modeled
// via dailyBreaks rather than a shorter continuousMinutes window, since it
// recurs every trading day rather than being a one-off early close.
export const XTKS_CALENDAR: TradingCalendar = {
  exchangeMic: "XTKS",
  timezone: "Asia/Tokyo",
  openHour: 9,
  openMinute: 0,
  hours: {
    preOpenMinutes: 0,
    openingAuctionMinutes: 0,
    continuousMinutes: 360, // 09:00-15:00 spanning both sessions; lunch carved out below
    closingAuctionMinutes: 0,
    postCloseMinutes: 0,
  },
  holidays: [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03", // New Year holiday period (TSE closed through Jan 3)
    "2026-01-12", // Coming of Age Day
    "2026-02-11", // National Foundation Day
    "2026-02-23", // Emperor's Birthday
    "2026-03-20", // Vernal Equinox Day
    "2026-04-29", // Showa Day
    "2026-05-04", // Greenery Day
    "2026-05-05", // Children's Day
    "2026-05-06", // Constitution Day observed (May 3 falls on a Sunday)
    "2026-07-20", // Marine Day
    "2026-09-21", // Respect for the Aged Day
    "2026-09-23", // Autumn Equinox Day
    "2026-10-12", // Sports Day
    "2026-11-03", // Culture Day
    "2026-11-23", // Labor Thanksgiving Day
    "2026-12-31", // Year-end closure (TSE closed Dec 31)
  ],
  earlyCloses: {},
  dailyBreaks: [{ startMinute: 150, endMinute: 210 }], // 11:30-12:30 JST lunch break
};

export interface AssetCalendarKey {
  assetClass?: string;
  exchange?: string;
  instrumentType?: string;
}

const EXCHANGE_CALENDARS: Record<string, TradingCalendar> = {
  XNAS: US_EQUITY_CALENDAR,
  XNYS: US_EQUITY_CALENDAR,
  XCHI: US_EQUITY_CALENDAR,
  ARCX: US_EQUITY_CALENDAR,
  XCME: COMMODITY_CALENDAR,
  XNYM: COMMODITY_CALENDAR,
  XCBT: COMMODITY_CALENDAR,
  XLON: XLON_CALENDAR,
  XPAR: EURONEXT_CALENDAR,
  XAMS: EURONEXT_CALENDAR,
  XETR: XETR_CALENDAR,
  XTKS: XTKS_CALENDAR,
};

/**
 * Resolve the calendar that applies to a given order/instrument. Options
 * are gated by their underlying equity's calendar rather than a distinct
 * derivatives calendar — the platform doesn't model separate options-market
 * hours, so this deliberately reuses the exchange-based equity lookup.
 */
export function calendarForOrder(key: AssetCalendarKey): TradingCalendar {
  if (key.assetClass === "fx") return FX_CALENDAR;
  if (key.assetClass === "bond") return SIFMA_BOND_CALENDAR;
  if (key.assetClass === "commodity") return COMMODITY_CALENDAR;
  if (key.exchange && EXCHANGE_CALENDARS[key.exchange]) {
    return EXCHANGE_CALENDARS[key.exchange];
  }
  return US_EQUITY_CALENDAR;
}
