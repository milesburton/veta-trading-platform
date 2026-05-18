import {
  featureReceived,
  featuresBatchReceived,
  intelligenceSlice,
  recommendationReceived,
  signalReceived,
  signalsBatchReceived,
} from "@veta/frontend/store/intelligenceSlice";
import { describe, expect, it } from "vitest";

const { reducer } = intelligenceSlice;

describe("intelligenceSlice", () => {
  it("stores single signal and feature by symbol", () => {
    let state = reducer(
      undefined,
      signalReceived({
        symbol: "AAPL",
        score: 0.7,
        direction: "long",
        confidence: 0.8,
        factors: [],
        ts: 1,
      })
    );

    state = reducer(
      state,
      featureReceived({
        symbol: "AAPL",
        ts: 1,
        momentum: 1,
        relativeVolume: 1,
        realisedVol: 1,
        sectorRelativeStrength: 1,
        eventScore: 1,
        newsVelocity: 1,
        sentimentDelta: 1,
      })
    );

    expect(state.signals.AAPL.score).toBe(0.7);
    expect(state.features.AAPL.newsVelocity).toBe(1);
  });

  it("stores batches and overwrites symbol entries with latest payload", () => {
    let state = reducer(
      undefined,
      signalsBatchReceived([
        {
          symbol: "AAPL",
          score: 0.1,
          direction: "neutral",
          confidence: 0.5,
          factors: [],
          ts: 1,
        },
      ])
    );

    state = reducer(
      state,
      signalsBatchReceived([
        {
          symbol: "AAPL",
          score: 0.9,
          direction: "long",
          confidence: 0.9,
          factors: [],
          ts: 2,
        },
        {
          symbol: "MSFT",
          score: -0.4,
          direction: "short",
          confidence: 0.7,
          factors: [],
          ts: 2,
        },
      ])
    );

    state = reducer(
      state,
      featuresBatchReceived([
        {
          symbol: "MSFT",
          ts: 3,
          momentum: 0.2,
          relativeVolume: 0.3,
          realisedVol: 0.4,
          sectorRelativeStrength: 0.5,
          eventScore: 0.6,
          newsVelocity: 0.7,
          sentimentDelta: 0.8,
        },
      ])
    );

    expect(state.signals.AAPL.score).toBe(0.9);
    expect(state.signals.MSFT.direction).toBe("short");
    expect(state.features.MSFT.sentimentDelta).toBe(0.8);
  });

  it("drops single signals with unsafe symbols (prototype-pollution guard)", () => {
    const state = reducer(
      undefined,
      signalReceived({
        symbol: "__proto__",
        score: 0,
        direction: "neutral",
        confidence: 0,
        factors: [],
        ts: 0,
      })
    );
    expect(Object.hasOwn(state.signals, "__proto__")).toBe(false);
  });

  it("drops single features with unsafe symbols", () => {
    const state = reducer(
      undefined,
      featureReceived({
        symbol: "constructor",
        ts: 0,
        momentum: 0,
        relativeVolume: 0,
        realisedVol: 0,
        sectorRelativeStrength: 0,
        eventScore: 0,
        newsVelocity: 0,
        sentimentDelta: 0,
      })
    );
    expect(Object.hasOwn(state.features, "constructor")).toBe(false);
  });

  it("skips unsafe entries in batches but accepts the rest", () => {
    const state = reducer(
      undefined,
      signalsBatchReceived([
        {
          symbol: "__proto__",
          score: 0,
          direction: "neutral",
          confidence: 0,
          factors: [],
          ts: 0,
        },
        { symbol: "AAPL", score: 0.5, direction: "long", confidence: 0.5, factors: [], ts: 1 },
      ])
    );
    expect(state.signals.AAPL.score).toBe(0.5);
    expect(Object.hasOwn(state.signals, "__proto__")).toBe(false);
  });

  it("keeps recommendations capped at 100 with newest first", () => {
    let state = reducer(undefined, { type: "noop" });

    for (let i = 0; i < 105; i++) {
      state = reducer(
        state,
        recommendationReceived({
          symbol: `SYM${i}`,
          action: "buy",
          suggestedQty: i + 1,
          rationale: "r",
          signalScore: i,
          confidence: 0.5,
          ts: i,
        })
      );
    }

    expect(state.recommendations.length).toBe(100);
    expect(state.recommendations[0].symbol).toBe("SYM104");
    expect(state.recommendations.at(-1)?.symbol).toBe("SYM5");
  });
});
