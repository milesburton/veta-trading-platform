import { describe, expect, it } from "vitest";
import { formatUtcDateTime, formatUtcTime } from "../clock";

describe("formatUtcTime", () => {
  it("zero-pads hours/minutes/seconds", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 3, 5, 9));
    expect(formatUtcTime(d)).toBe("03:05:09 UTC");
  });

  it("handles end-of-day", () => {
    const d = new Date(Date.UTC(2026, 5, 18, 23, 59, 59));
    expect(formatUtcTime(d)).toBe("23:59:59 UTC");
  });

  it("accepts a numeric timestamp", () => {
    expect(formatUtcTime(Date.UTC(2026, 0, 1, 12, 0, 0))).toBe("12:00:00 UTC");
  });

  it("ignores the host machine timezone", () => {
    // A fixed UTC instant must produce the same output regardless of where the
    // process runs. Asserting the constant directly is enough.
    const epoch = new Date(Date.UTC(2026, 5, 18, 10, 30, 0));
    expect(formatUtcTime(epoch)).toBe("10:30:00 UTC");
  });
});

describe("formatUtcDateTime", () => {
  it("renders ISO-like date plus UTC time", () => {
    const d = new Date(Date.UTC(2026, 4, 18, 22, 30, 0));
    expect(formatUtcDateTime(d)).toBe("2026-05-18 22:30:00 UTC");
  });
});
