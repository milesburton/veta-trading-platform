import { describe, expect, it } from "vitest";
import {
  buildSessionSchedule,
  isEarlyClose,
  isHoliday,
  resolvePhaseFromMinute,
  totalTradingMinutes,
  US_EQUITY_CALENDAR,
} from "../trading-calendar";

describe("buildSessionSchedule", () => {
  const schedule = buildSessionSchedule(US_EQUITY_CALENDAR);

  it("produces 5 phases in order", () => {
    expect(schedule).toHaveLength(5);
    expect(schedule.map((s) => s.phase)).toEqual([
      "PRE_OPEN",
      "OPENING_AUCTION",
      "CONTINUOUS",
      "CLOSING_AUCTION",
      "CLOSED",
    ]);
  });

  it("phases are contiguous with no gaps", () => {
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].startMinute).toBe(schedule[i - 1].endMinute);
    }
  });

  it("first phase starts at minute 0", () => {
    expect(schedule[0].startMinute).toBe(0);
  });

  it("continuous phase is the longest", () => {
    const continuous = schedule.find((s) => s.phase === "CONTINUOUS");
    const duration = continuous ? continuous.endMinute - continuous.startMinute : 0;
    expect(duration).toBe(370);
  });

  it("early close shortens continuous phase", () => {
    const earlySchedule = buildSessionSchedule(US_EQUITY_CALENDAR, "2026-11-27");
    const continuous = earlySchedule.find((s) => s.phase === "CONTINUOUS");
    const normalContinuous = schedule.find((s) => s.phase === "CONTINUOUS");
    expect(continuous!.endMinute - continuous!.startMinute).toBeLessThan(
      normalContinuous!.endMinute - normalContinuous!.startMinute
    );
  });
});

describe("resolvePhaseFromMinute", () => {
  const schedule = buildSessionSchedule(US_EQUITY_CALENDAR);

  it.each([
    [0, "PRE_OPEN"],
    [4, "PRE_OPEN"],
    [5, "OPENING_AUCTION"],
    [9, "OPENING_AUCTION"],
    [10, "CONTINUOUS"],
    [200, "CONTINUOUS"],
    [379, "CONTINUOUS"],
    [380, "CLOSING_AUCTION"],
    [384, "CLOSING_AUCTION"],
    [385, "CLOSED"],
    [999, "CLOSED"],
  ] as const)("minute %d → %s", (minute, expected) => {
    expect(resolvePhaseFromMinute(schedule, minute)).toBe(expected);
  });
});

describe("isHoliday", () => {
  it.each([
    ["2026-01-01", true],
    ["2026-12-25", true],
    ["2026-03-30", false],
  ] as const)("%s → %s", (date, expected) => {
    expect(isHoliday(US_EQUITY_CALENDAR, date)).toBe(expected);
  });
});

describe("isEarlyClose", () => {
  it.each([
    ["2026-11-27", true],
    ["2026-12-24", true],
    ["2026-12-25", false],
  ] as const)("%s → %s", (date, expected) => {
    expect(isEarlyClose(US_EQUITY_CALENDAR, date)).toBe(expected);
  });
});

describe("totalTradingMinutes", () => {
  it("normal day is 390 minutes", () => {
    expect(totalTradingMinutes(US_EQUITY_CALENDAR)).toBe(390);
  });

  it("early close day is shorter", () => {
    expect(totalTradingMinutes(US_EQUITY_CALENDAR, "2026-11-27")).toBeLessThan(390);
  });
});
