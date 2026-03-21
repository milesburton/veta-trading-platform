import {
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.210.0/assert/mod.ts";
import { scoreFeatureVector } from "../signal-engine/scorer.ts";
import { DEFAULT_WEIGHTS } from "../signal-engine/weight-store.ts";
import type { FeatureVector } from "../types/intelligence.ts";

function makeNeutralFv(symbol = "TEST"): FeatureVector {
  return {
    symbol,
    ts: Date.now(),
    momentum: 0,
    relativeVolume: 1,
    realisedVol: 0,
    sectorRelativeStrength: 0,
    eventScore: 0,
    newsVelocity: 0,
    sentimentDelta: 0,
  };
}


Deno.test("default weights: all 7 features present, realisedVol is negative, abs-sum = 1.0", () => {
  const keys = Object.keys(DEFAULT_WEIGHTS);
  assertEquals(keys.length, 7);
  assertEquals("momentum" in DEFAULT_WEIGHTS, true);
  assertEquals("realisedVol" in DEFAULT_WEIGHTS, true);
  assertEquals(DEFAULT_WEIGHTS.realisedVol < 0, true);

  const absSum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + Math.abs(b), 0);
  assertAlmostEquals(absSum, 1.0, 0.001);
});


Deno.test("scorer: neutral FeatureVector → neutral direction with 7 factors", () => {
  const sig = scoreFeatureVector(makeNeutralFv(), DEFAULT_WEIGHTS);
  assertEquals(sig.symbol, "TEST");
  assertEquals(sig.direction, "neutral");
  assertEquals(sig.factors.length, 7);
});

Deno.test("scorer: strong positive momentum + positive sentiment → long; inverse → short", () => {
  const fvLong = makeNeutralFv();
  fvLong.momentum = 0.1;
  fvLong.sentimentDelta = 1.0;
  const sigLong = scoreFeatureVector(fvLong, DEFAULT_WEIGHTS);
  assertEquals(sigLong.direction, "long");
  assertEquals(sigLong.score > 0.2, true);

  const fvShort = makeNeutralFv();
  fvShort.momentum = -0.1;
  fvShort.sentimentDelta = -1.0;
  const sigShort = scoreFeatureVector(fvShort, DEFAULT_WEIGHTS);
  assertEquals(sigShort.direction, "short");
  assertEquals(sigShort.score < -0.2, true);
});

Deno.test("scorer: score is clamped to [-1, 1] even when all features are maxed", () => {
  const fv = makeNeutralFv();
  fv.momentum = 1.0;
  fv.relativeVolume = 100;
  fv.sectorRelativeStrength = 1.0;
  fv.eventScore = 100;
  fv.newsVelocity = 1000;
  fv.sentimentDelta = 1.0;
  const sig = scoreFeatureVector(fv, DEFAULT_WEIGHTS);
  assertEquals(sig.score <= 1, true);
  assertEquals(sig.score >= -1, true);
});

Deno.test("scorer: factors array contains all 7 named features", () => {
  const sig = scoreFeatureVector(makeNeutralFv(), DEFAULT_WEIGHTS);
  const names = new Set(sig.factors.map((f) => f.name));
  for (const name of ["momentum", "relativeVolume", "realisedVol", "sectorRelativeStrength", "eventScore", "newsVelocity", "sentimentDelta"]) {
    assertEquals(names.has(name as never), true, `missing factor: ${name}`);
  }
});

Deno.test("scorer: confidence = abs(score); realisedVol reduces score (negative weight)", () => {
  const fv = makeNeutralFv();
  fv.momentum = 0.05;
  const sig = scoreFeatureVector(fv, DEFAULT_WEIGHTS);
  assertAlmostEquals(sig.confidence, Math.min(1, Math.abs(sig.score)), 1e-6);

  const fvHighVol = makeNeutralFv();
  fvHighVol.realisedVol = 0.8;
  const sigLow  = scoreFeatureVector(makeNeutralFv(), DEFAULT_WEIGHTS);
  const sigHigh = scoreFeatureVector(fvHighVol, DEFAULT_WEIGHTS);
  assertEquals(sigHigh.score < sigLow.score, true, "high vol lowers score");
});

Deno.test("scorer: all-zero weights produce zero score for any FeatureVector", () => {
  const zeroWeights = {
    momentum: 0, relativeVolume: 0, realisedVol: 0,
    sectorRelativeStrength: 0, eventScore: 0, newsVelocity: 0, sentimentDelta: 0,
  };
  const sig = scoreFeatureVector(makeNeutralFv(), zeroWeights);
  assertAlmostEquals(sig.score, 0, 1e-6);
  assertEquals(sig.direction, "neutral");
});
