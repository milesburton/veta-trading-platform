import {
  FINANCIAL_CENTERS,
  formatCenterDate,
  formatCenterTime,
  isCenterOpen,
} from "@veta/frontend/domain/market/financial-centers";
import { describe, expect, it } from "vitest";

function centerById(id: string) {
  const center = FINANCIAL_CENTERS.find((c) => c.id === id);
  if (!center) throw new Error(`missing test fixture: financial center ${id}`);
  return center;
}

const NYC = centerById("NYC");
const TYO = centerById("TYO");

describe("isCenterOpen", () => {
  it("is open during regular NYC session hours on a weekday", () => {
    // Wednesday 2026-08-05 14:00 UTC = 10:00 America/New_York
    const now = new Date("2026-08-05T14:00:00Z");
    expect(isCenterOpen(NYC, now)).toBe(true);
  });

  it("is closed before NYC market open", () => {
    // Wednesday 2026-08-05 09:00 UTC = 05:00 America/New_York
    const now = new Date("2026-08-05T09:00:00Z");
    expect(isCenterOpen(NYC, now)).toBe(false);
  });

  it("is closed after NYC market close", () => {
    // Wednesday 2026-08-05 22:00 UTC = 18:00 America/New_York
    const now = new Date("2026-08-05T22:00:00Z");
    expect(isCenterOpen(NYC, now)).toBe(false);
  });

  it("is closed on a Saturday even during regular hours", () => {
    // Saturday 2026-08-08 14:00 UTC = 10:00 America/New_York
    const now = new Date("2026-08-08T14:00:00Z");
    expect(isCenterOpen(NYC, now)).toBe(false);
  });

  it("is closed on a Sunday even during regular hours", () => {
    // Sunday 2026-08-09 14:00 UTC = 10:00 America/New_York
    const now = new Date("2026-08-09T14:00:00Z");
    expect(isCenterOpen(NYC, now)).toBe(false);
  });

  it("evaluates each centre independently in its own timezone", () => {
    // Wednesday 2026-08-05 02:00 UTC = 11:00 Asia/Tokyo (open), 22:00 previous day America/New_York (closed)
    const now = new Date("2026-08-05T02:00:00Z");
    expect(isCenterOpen(TYO, now)).toBe(true);
    expect(isCenterOpen(NYC, now)).toBe(false);
  });
});

describe("formatCenterTime", () => {
  it("formats HH:MM:SS in the centre's own timezone", () => {
    const now = new Date("2026-08-05T14:00:00Z");
    expect(formatCenterTime(NYC, now)).toBe("10:00:00");
  });
});

describe("formatCenterDate", () => {
  it("formats weekday, day and month in the centre's own timezone", () => {
    const now = new Date("2026-08-05T14:00:00Z");
    expect(formatCenterDate(NYC, now)).toMatch(/Wed 05 Aug/);
  });
});

describe("FINANCIAL_CENTERS", () => {
  it("has a unique id per centre", () => {
    const ids = FINANCIAL_CENTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
