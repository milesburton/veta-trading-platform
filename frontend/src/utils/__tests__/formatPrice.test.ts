import { formatPrice } from "@veta/frontend/utils/formatPrice";
import { describe, expect, it } from "vitest";

describe("formatPrice", () => {
  it("formats equity symbols to 2 decimals", () => {
    expect(formatPrice("AAPL", 185.4)).toBe("185.40");
    expect(formatPrice("MSFT", 412.345)).toBe("412.35");
    expect(formatPrice("NVDA", 100)).toBe("100.00");
  });

  it("formats FX symbols (contain '/') to 4 decimals", () => {
    expect(formatPrice("EUR/USD", 1.0876)).toBe("1.0876");
    expect(formatPrice("GBP/USD", 1.27)).toBe("1.2700");
    expect(formatPrice("USD/JPY", 153.123_49)).toBe("153.1235");
  });

  it("defaults to 2 decimals when symbol is undefined", () => {
    expect(formatPrice(undefined, 99.5)).toBe("99.50");
    expect(formatPrice(undefined, 0)).toBe("0.00");
  });

  it("defaults to 2 decimals when symbol is empty string", () => {
    expect(formatPrice("", 42.1)).toBe("42.10");
  });

  it("handles negative prices", () => {
    expect(formatPrice("AAPL", -1.5)).toBe("-1.50");
    expect(formatPrice("EUR/USD", -1.234_567)).toBe("-1.2346");
  });

  it("handles zero", () => {
    expect(formatPrice("AAPL", 0)).toBe("0.00");
    expect(formatPrice("EUR/USD", 0)).toBe("0.0000");
  });
});
