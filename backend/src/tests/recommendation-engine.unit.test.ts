import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  DEFAULT_EXPIRIES_SECS,
  generateStrikes,
  scoreOption,
  scoreOptionWithSignal,
} from "../analytics/recommendation-engine.ts";
import type { SignalInput } from "../analytics/types.ts";

const SPOT = 100;
const STRIKE = 100;
const TIME = 1;
const RATE = 0.05;
const VOL = 0.2;

const BASE_SIGNAL: SignalInput = {
  score: 0.7,
  direction: "long",
  confidence: 0.8,
  factors: [
    { name: "market_sentiment", weight: 0.6, contribution: 0.5 },
    { name: "technical_analysis", weight: 0.4, contribution: 0.3 },
  ],
};

function scoreCall(spot = SPOT, strike = STRIKE, time = TIME, rate = RATE, vol = VOL) {
  return scoreOption("call", spot, strike, time, rate, vol);
}

function scorePut(spot = SPOT, strike = STRIKE, time = TIME, rate = RATE, vol = VOL) {
  return scoreOption("put", spot, strike, time, rate, vol);
}

function assertBaseRecommendation(
  result: ReturnType<typeof scoreCall>,
  scoringMode: "rule-based" | "signal-driven"
) {
  assert(result.optionType === "call" || result.optionType === "put");
  assertEquals(result.strike, STRIKE);
  assert(result.price > 0);
  assert(result.score >= -100 && result.score <= 100);
  assert(result.signalStrength !== undefined);
  assert(result.reasons.length >= 0);
  assert(result.greeks !== undefined);
  assertEquals(result.impliedVol, VOL);
  assertEquals(result.scoringMode, scoringMode);
}

Deno.test("[recommendation-engine] scoreOption returns valid recommendation", () => {
  assertBaseRecommendation(scoreCall(), "rule-based");
});

Deno.test("[recommendation-engine] scoreOption keeps delta in the expected range", () => {
  const callResult = scoreCall();
  const putResult = scorePut();

  assert(callResult.greeks.delta >= 0);
  assert(callResult.greeks.delta <= 1);
  assert(putResult.greeks.delta >= -1);
  assert(putResult.greeks.delta <= 0);
});

Deno.test("[recommendation-engine] scoreOption returns score in valid range", () => {
  const result = scoreCall();
  assert(result.score >= -100);
  assert(result.score <= 100);
});

Deno.test("[recommendation-engine] scoreOptionWithSignal returns valid recommendation", () => {
  const result = scoreOptionWithSignal("call", SPOT, STRIKE, TIME, RATE, VOL, BASE_SIGNAL);

  assertBaseRecommendation(result, "signal-driven");
  assertEquals(result.signalScore, BASE_SIGNAL.score);
  assertEquals(result.signalConfidence, BASE_SIGNAL.confidence);
  assertEquals(result.signalDirection, BASE_SIGNAL.direction);
  assert(result.topFactors !== undefined);
  assert(result.topFactors.length > 0);
});

Deno.test("[recommendation-engine] generateStrikes returns valid strike prices", () => {
  const strikes = generateStrikes(SPOT);

  assert(Array.isArray(strikes));
  assert(strikes.length > 0);

  for (let i = 1; i < strikes.length; i++) {
    assert(strikes[i] >= strikes[i - 1]);
  }

  for (const strike of strikes) {
    assert(strike > 0);
  }
});

Deno.test("[recommendation-engine] generateStrikes works across spot ranges", () => {
  for (const spot of [25, 500]) {
    assert(generateStrikes(spot).length > 0);
  }
});

Deno.test("[recommendation-engine] DEFAULT_EXPIRIES_SECS has correct format", () => {
  assert(Array.isArray(DEFAULT_EXPIRIES_SECS));
  assert(DEFAULT_EXPIRIES_SECS.length > 0);

  for (const expiry of DEFAULT_EXPIRIES_SECS) {
    assert(expiry > 0);
    assert(Number.isInteger(expiry));
  }
});

Deno.test("[recommendation-engine] scoreOption handles extreme moneyness and volatility", () => {
  assert(scoreCall(200).greeks.delta > 0.9);
  assert(scoreCall(50).greeks.delta < 0.1);
  assertEquals(scoreCall(SPOT, STRIKE, TIME, RATE, 0.5).impliedVol, 0.5);
});
