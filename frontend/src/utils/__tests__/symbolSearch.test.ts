import { describe, expect, it } from "vitest";
import type { AssetDef } from "../../types";
import { matchAssets, parseTradePaste } from "../symbolSearch";

const ASSETS: AssetDef[] = [
  {
    symbol: "AAPL",
    initialPrice: 185,
    volatility: 0.02,
    sector: "Technology",
    name: "Apple Inc.",
    ric: "AAPL.OQ",
    bbgTicker: "AAPL US Equity",
    isin: "US0378331005",
    exchange: "XNAS",
  },
  {
    symbol: "MSFT",
    initialPrice: 420,
    volatility: 0.018,
    sector: "Technology",
    name: "Microsoft Corp.",
    ric: "MSFT.OQ",
    bbgTicker: "MSFT US Equity",
    isin: "US5949181045",
    exchange: "XNAS",
  },
  {
    symbol: "EUR/USD",
    initialPrice: 1.085,
    volatility: 0.005,
    sector: "FX",
    name: "Euro / US Dollar",
    ric: "EURUSD=X",
    bbgTicker: "EURUSD Curncy",
  },
];

describe("parseTradePaste", () => {
  it("parses a full Bloomberg-style trade string", () => {
    const result = parseTradePaste("BUY 5000 AAPL US Equity @ 185.50 TWAP", ASSETS);
    expect(result).toEqual({
      side: "BUY",
      quantity: 5000,
      symbol: "AAPL",
      price: 185.5,
      strategy: "TWAP",
    });
  });

  it("parses SELL side", () => {
    const result = parseTradePaste("SELL 200 MSFT @ 420 LIMIT", ASSETS);
    expect(result?.side).toBe("SELL");
    expect(result?.symbol).toBe("MSFT");
    expect(result?.strategy).toBe("LIMIT");
  });

  it("matches by RIC", () => {
    const result = parseTradePaste("BUY 100 AAPL.OQ", ASSETS);
    expect(result?.symbol).toBe("AAPL");
  });

  it("matches by ISIN", () => {
    const result = parseTradePaste("BUY 100 US0378331005", ASSETS);
    expect(result?.symbol).toBe("AAPL");
  });

  it("handles comma-separated quantities", () => {
    const result = parseTradePaste("BUY 10,000 AAPL", ASSETS);
    expect(result?.quantity).toBe(10000);
  });

  it("handles quantity with shares suffix", () => {
    const result = parseTradePaste("BUY 500 shares MSFT", ASSETS);
    expect(result?.quantity).toBe(500);
  });

  it("returns null for unrecognised input", () => {
    expect(parseTradePaste("hello world", ASSETS)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseTradePaste("", ASSETS)).toBeNull();
  });

  it("parses symbol-only input", () => {
    const result = parseTradePaste("AAPL", ASSETS);
    expect(result?.symbol).toBe("AAPL");
    expect(result?.side).toBeUndefined();
  });

  it("parses side-only input", () => {
    const result = parseTradePaste("BUY", ASSETS);
    expect(result?.side).toBe("BUY");
    expect(result?.symbol).toBeUndefined();
  });

  it("prefers longer BBG ticker match over short symbol", () => {
    const result = parseTradePaste("AAPL US Equity", ASSETS);
    expect(result?.symbol).toBe("AAPL");
  });

  it("handles all strategy types", () => {
    for (const strat of [
      "LIMIT",
      "TWAP",
      "POV",
      "VWAP",
      "ICEBERG",
      "SNIPER",
      "ARRIVAL_PRICE",
      "IS",
      "MOMENTUM",
    ]) {
      const result = parseTradePaste(`BUY 100 AAPL ${strat}`, ASSETS);
      expect(result?.strategy).toBe(strat);
    }
  });

  it("is case-insensitive", () => {
    const result = parseTradePaste("buy 100 aapl us equity @ 185 twap", ASSETS);
    expect(result?.side).toBe("BUY");
    expect(result?.symbol).toBe("AAPL");
    expect(result?.strategy).toBe("TWAP");
  });

  it("matches FX pair by BBG ticker", () => {
    const result = parseTradePaste("BUY 1000000 EURUSD Curncy", ASSETS);
    expect(result?.symbol).toBe("EUR/USD");
  });
});

describe("matchAssets", () => {
  it("returns empty for empty query", () => {
    expect(matchAssets("", ASSETS)).toEqual([]);
  });

  it("matches by symbol", () => {
    const results = matchAssets("AAPL", ASSETS);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("AAPL");
  });

  it("matches by partial name", () => {
    const results = matchAssets("Apple", ASSETS);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("AAPL");
  });

  it("matches by sector", () => {
    const results = matchAssets("Technology", ASSETS);
    expect(results).toHaveLength(2);
  });

  it("matches by RIC", () => {
    const results = matchAssets("AAPL.OQ", ASSETS);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("AAPL");
  });

  it("matches by ISIN", () => {
    const results = matchAssets("US037833", ASSETS);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("AAPL");
  });

  it("matches by exchange", () => {
    const results = matchAssets("XNAS", ASSETS);
    expect(results).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    const results = matchAssets("aapl", ASSETS);
    expect(results).toHaveLength(1);
  });

  it("limits results to 20", () => {
    const manyAssets = Array.from({ length: 50 }, (_, i) => ({
      symbol: `SYM${i}`,
      initialPrice: 100,
      volatility: 0.02,
      sector: "Test",
    }));
    const results = matchAssets("SYM", manyAssets);
    expect(results).toHaveLength(20);
  });
});
