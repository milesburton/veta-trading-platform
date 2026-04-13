import { describe, expect, it } from "vitest";
import type { RootState } from "../index";
import { selectSymbols } from "../selectors";

function makeState(symbols: string[]): RootState {
  return {
    market: {
      assets: symbols.map((s) => ({
        symbol: s,
        initialPrice: 100,
        volatility: 0.02,
        sector: "Test",
      })),
      prices: {},
      priceHistory: {},
      sessionOpen: {},
      candleHistory: {},
      candlesReady: {},
      connected: true,
      orderBook: {},
      sessionPhase: "CONTINUOUS" as const,
    },
  } as unknown as RootState;
}

describe("selectSymbols", () => {
  it("extracts symbol strings from assets", () => {
    const state = makeState(["AAPL", "MSFT", "GOOGL"]);
    expect(selectSymbols(state)).toEqual(["AAPL", "MSFT", "GOOGL"]);
  });

  it("returns stable reference when assets unchanged", () => {
    const state = makeState(["AAPL", "MSFT"]);
    const first = selectSymbols(state);
    const second = selectSymbols(state);
    expect(first).toBe(second);
  });

  it("returns new reference when assets change", () => {
    const state1 = makeState(["AAPL"]);
    const state2 = makeState(["AAPL", "MSFT"]);
    const first = selectSymbols(state1);
    const second = selectSymbols(state2);
    expect(first).not.toBe(second);
  });

  it("returns empty array for no assets", () => {
    const state = makeState([]);
    expect(selectSymbols(state)).toEqual([]);
  });
});
