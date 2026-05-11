import { describe, expect, it } from "vitest";
import { parseQuickTrade } from "../parse";

describe("parseQuickTrade — happy paths", () => {
  it("parses basic shorthand", () => {
    expect(parseQuickTrade("buy 500 aapl")).toEqual({
      side: "BUY",
      symbol: "AAPL",
      quantity: 500,
    });
  });

  it("parses with explicit limit price", () => {
    expect(parseQuickTrade("buy 500 aapl @ 200")).toEqual({
      side: "BUY",
      symbol: "AAPL",
      quantity: 500,
      limitPrice: 200,
    });
  });

  it("parses limit price with $ prefix and decimals", () => {
    expect(parseQuickTrade("sell 100 msft @ $412.50")).toEqual({
      side: "SELL",
      symbol: "MSFT",
      quantity: 100,
      limitPrice: 412.5,
    });
  });

  it("accepts k/m quantity suffixes", () => {
    expect(parseQuickTrade("buy 2.5k aapl")?.quantity).toBe(2_500);
    expect(parseQuickTrade("sell 1m tsla")?.quantity).toBe(1_000_000);
  });

  it("accepts comma-separated quantity", () => {
    expect(parseQuickTrade("buy 10,000 aapl")?.quantity).toBe(10_000);
  });

  it("accepts free word order", () => {
    expect(parseQuickTrade("aapl buy 500 @ 200")).toEqual({
      side: "BUY",
      symbol: "AAPL",
      quantity: 500,
      limitPrice: 200,
    });
    expect(parseQuickTrade("500 aapl sell")).toEqual({
      side: "SELL",
      symbol: "AAPL",
      quantity: 500,
    });
  });

  it("captures @ without spaces", () => {
    expect(parseQuickTrade("buy 100 aapl@190")?.limitPrice).toBe(190);
  });
});

describe("parseQuickTrade — strategies", () => {
  it("recognises TWAP plus duration", () => {
    expect(parseQuickTrade("buy 500 aapl twap 30m")).toMatchObject({
      strategy: "TWAP",
      twapDurationMinutes: 30,
    });
    expect(parseQuickTrade("buy 500 aapl twap 1h")).toMatchObject({
      strategy: "TWAP",
      twapDurationMinutes: 60,
    });
  });

  it("recognises POV with percent rate", () => {
    expect(parseQuickTrade("buy 5000 aapl pov 20%")).toMatchObject({
      strategy: "POV",
      povRatePercent: 20,
    });
  });

  it("recognises VWAP", () => {
    expect(parseQuickTrade("sell 1000 aapl vwap")?.strategy).toBe("VWAP");
  });

  it("recognises ICEBERG with visible= parameter", () => {
    expect(parseQuickTrade("buy 10000 aapl iceberg visible=200")).toMatchObject({
      strategy: "ICEBERG",
      icebergVisibleQty: 200,
    });
  });

  it("recognises strategy aliases", () => {
    expect(parseQuickTrade("buy 100 aapl lim")?.strategy).toBe("LIMIT");
    expect(parseQuickTrade("buy 100 aapl mom")?.strategy).toBe("MOMENTUM");
    expect(parseQuickTrade("buy 100 aapl ap")?.strategy).toBe("ARRIVAL_PRICE");
  });
});

describe("parseQuickTrade — TIF", () => {
  it("recognises DAY/IOC/GTC/FOK", () => {
    expect(parseQuickTrade("buy 100 aapl ioc")?.tif).toBe("IOC");
    expect(parseQuickTrade("sell 100 aapl gtc")?.tif).toBe("GTC");
  });
});

describe("parseQuickTrade — rejections", () => {
  it("returns null on empty input", () => {
    expect(parseQuickTrade("")).toBeNull();
    expect(parseQuickTrade("   ")).toBeNull();
  });

  it("returns null when side is missing", () => {
    expect(parseQuickTrade("100 aapl")).toBeNull();
  });

  it("returns null when symbol is missing", () => {
    expect(parseQuickTrade("buy 500")).toBeNull();
  });

  it("returns null on absurdly long input", () => {
    expect(parseQuickTrade(`buy 500 aapl ${"x".repeat(300)}`)).toBeNull();
  });

  it("rejects unknown symbol when knownSymbols is supplied", () => {
    expect(parseQuickTrade("buy 500 fake", { knownSymbols: new Set(["AAPL", "MSFT"]) })).toBeNull();
    expect(parseQuickTrade("buy 500 aapl", { knownSymbols: new Set(["AAPL"]) })).not.toBeNull();
  });
});

describe("parseQuickTrade — boundaries", () => {
  it("rejects zero / negative quantity", () => {
    expect(parseQuickTrade("buy 0 aapl")?.quantity).toBeUndefined();
  });

  it("rejects out-of-range POV percent", () => {
    expect(parseQuickTrade("buy 100 aapl pov 150%")?.povRatePercent).toBeUndefined();
  });
});
