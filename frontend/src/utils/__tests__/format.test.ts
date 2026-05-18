import { formatBps, formatCurrency, formatTime, pnlColor } from "@veta/frontend/utils/format";
import { describe, expect, it } from "vitest";

describe("format utilities", () => {
  it("formats time as zero-padded UTC HH:MM:SS suffixed with UTC", () => {
    const ms = Date.UTC(2026, 4, 18, 10, 11, 12);
    expect(formatTime(ms)).toBe("10:11:12 UTC");
  });

  it("formatTime is independent of host TZ", () => {
    const ms = Date.UTC(2026, 0, 1, 23, 59, 59);
    expect(formatTime(ms)).toBe("23:59:59 UTC");
  });

  it("formats bps with sign", () => {
    expect(formatBps(12.34)).toBe("+12.3bp");
    expect(formatBps(-12.34)).toBe("-12.3bp");
    expect(formatBps(0)).toBe("0.0bp");
  });

  it("formats currency across ranges", () => {
    expect(formatCurrency(123.456)).toBe("123.46");
    expect(formatCurrency(12_345)).toBe("12.3K");
    expect(formatCurrency(9_876_543)).toBe("9.88M");
    expect(formatCurrency(-12_000)).toBe("-12.0K");
  });

  it("returns pnl css class by sign", () => {
    expect(pnlColor(1)).toBe("text-emerald-400");
    expect(pnlColor(-1)).toBe("text-red-400");
    expect(pnlColor(0)).toBe("text-muted");
  });
});
