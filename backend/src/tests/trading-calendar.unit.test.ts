import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  buildSessionSchedule,
  isEarlyClose,
  isHoliday,
  resolvePhaseFromMinute,
  totalTradingMinutes,
} from "../lib/tradingCalendar.ts";
import {
  calendarForOrder,
  COMMODITY_CALENDAR,
  FX_CALENDAR,
  FX_REDUCED_LIQUIDITY_DATES,
  SIFMA_BOND_CALENDAR,
  US_EQUITY_CALENDAR,
  XTKS_CALENDAR,
} from "../lib/marketCalendars.ts";

Deno.test("buildSessionSchedule produces 5 contiguous phases starting at minute 0", () => {
  const schedule = buildSessionSchedule(US_EQUITY_CALENDAR);
  assertEquals(schedule.length, 5);
  assertEquals(
    schedule.map((s) => s.phase),
    ["PRE_OPEN", "OPENING_AUCTION", "CONTINUOUS", "CLOSING_AUCTION", "CLOSED"]
  );
  assertEquals(schedule[0].startMinute, 0);
  for (let i = 1; i < schedule.length; i++) {
    assertEquals(schedule[i].startMinute, schedule[i - 1].endMinute);
  }
});

Deno.test("early close shortens the continuous phase", () => {
  const normal = buildSessionSchedule(US_EQUITY_CALENDAR);
  const early = buildSessionSchedule(US_EQUITY_CALENDAR, "2026-11-27");
  const normalContinuous = normal.find((s) => s.phase === "CONTINUOUS");
  const earlyContinuous = early.find((s) => s.phase === "CONTINUOUS");
  assert(normalContinuous && earlyContinuous);
  assert(earlyContinuous.endMinute - earlyContinuous.startMinute <
    normalContinuous.endMinute - normalContinuous.startMinute);
});

Deno.test("resolvePhaseFromMinute resolves each phase boundary correctly", () => {
  const schedule = buildSessionSchedule(US_EQUITY_CALENDAR);
  const cases: [number, string][] = [
    [0, "PRE_OPEN"],
    [4, "PRE_OPEN"],
    [5, "OPENING_AUCTION"],
    [9, "OPENING_AUCTION"],
    [10, "CONTINUOUS"],
    [379, "CONTINUOUS"],
    [380, "CLOSING_AUCTION"],
    [384, "CLOSING_AUCTION"],
    [385, "CLOSED"],
    [999, "CLOSED"],
  ];
  for (const [minute, expected] of cases) {
    assertEquals(resolvePhaseFromMinute(schedule, minute), expected);
  }
});

Deno.test("isHoliday and isEarlyClose", () => {
  assertEquals(isHoliday(US_EQUITY_CALENDAR, "2026-01-01"), true);
  assertEquals(isHoliday(US_EQUITY_CALENDAR, "2026-03-30"), false);
  assertEquals(isEarlyClose(US_EQUITY_CALENDAR, "2026-11-27"), true);
  assertEquals(isEarlyClose(US_EQUITY_CALENDAR, "2026-12-25"), false);
});

Deno.test("totalTradingMinutes: normal vs early-close day", () => {
  assertEquals(totalTradingMinutes(US_EQUITY_CALENDAR), 390);
  assert(totalTradingMinutes(US_EQUITY_CALENDAR, "2026-11-27") < 390);
});

Deno.test("dailyBreaks: commodity market halts during its daily maintenance window", () => {
  const schedule = buildSessionSchedule(COMMODITY_CALENDAR);
  // 16:00-17:00 CT break is minutes 1380-1439 relative to the 17:00 CT open
  assertEquals(
    resolvePhaseFromMinute(schedule, 1400, COMMODITY_CALENDAR.dailyBreaks),
    "HALTED"
  );
  assertEquals(
    resolvePhaseFromMinute(schedule, 700, COMMODITY_CALENDAR.dailyBreaks),
    "CONTINUOUS"
  );
});

Deno.test("dailyBreaks: Tokyo lunch break halts trading between morning and afternoon sessions", () => {
  const schedule = buildSessionSchedule(XTKS_CALENDAR);
  // 11:30-12:30 JST lunch is minutes 150-210 relative to the 09:00 open
  assertEquals(resolvePhaseFromMinute(schedule, 180, XTKS_CALENDAR.dailyBreaks), "HALTED");
  assertEquals(resolvePhaseFromMinute(schedule, 60, XTKS_CALENDAR.dailyBreaks), "CONTINUOUS");
  assertEquals(resolvePhaseFromMinute(schedule, 300, XTKS_CALENDAR.dailyBreaks), "CONTINUOUS");
});

Deno.test("dailyBreaks: a calendar with no breaks resolves normally (degenerate/absent case)", () => {
  const schedule = buildSessionSchedule(US_EQUITY_CALENDAR);
  assertEquals(
    resolvePhaseFromMinute(schedule, 200, US_EQUITY_CALENDAR.dailyBreaks),
    "CONTINUOUS"
  );
});

Deno.test("SIFMA bond calendar diverges from the equity calendar on Columbus Day and Veterans Day", () => {
  assertEquals(isHoliday(SIFMA_BOND_CALENDAR, "2026-10-12"), true); // Columbus Day
  assertEquals(isHoliday(SIFMA_BOND_CALENDAR, "2026-11-11"), true); // Veterans Day
  assertEquals(isHoliday(US_EQUITY_CALENDAR, "2026-10-12"), false);
  assertEquals(isHoliday(US_EQUITY_CALENDAR, "2026-11-11"), false);
});

Deno.test("FX reduced-liquidity dates are not modeled as calendar holidays", () => {
  // These dates must NOT reject order entry — only flag reduced liquidity.
  assertEquals(isHoliday(FX_CALENDAR, "2026-12-25"), false);
  assert(FX_REDUCED_LIQUIDITY_DATES.has("2026-12-25"));
});

Deno.test("calendarForOrder resolves by assetClass before falling back to exchange", () => {
  assertEquals(calendarForOrder({ assetClass: "fx" }).exchangeMic, "FX");
  assertEquals(calendarForOrder({ assetClass: "bond" }).exchangeMic, "SIFMA");
  assertEquals(calendarForOrder({ assetClass: "commodity" }).exchangeMic, "XCME");
  assertEquals(calendarForOrder({ exchange: "XLON" }).exchangeMic, "XLON");
  assertEquals(calendarForOrder({ exchange: "XTKS" }).exchangeMic, "XTKS");
  // Options are gated by the underlying equity's calendar — no distinct
  // derivatives calendar, so an unmatched/equity request falls back to US.
  assertEquals(calendarForOrder({ instrumentType: "option" }).exchangeMic, "XNAS");
  assertEquals(calendarForOrder({}).exchangeMic, "XNAS");
});
