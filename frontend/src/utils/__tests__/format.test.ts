import { describe, expect, it, vi } from "vitest";
import { formatBps, formatCurrency, formatTime, pnlColor } from "../format";

describe("format utilities", () => {
  it("formats time using locale time string", () => {
    const spy = vi
      .spyOn(Date.prototype, "toLocaleTimeString")
      .mockReturnValue("10:11:12 AM" as unknown as string);

    expect(formatTime(1_700_000_000_000)).toBe("10:11:12 AM");
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
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
    expect(pnlColor(0)).toBe("text-gray-500");
  });
});
