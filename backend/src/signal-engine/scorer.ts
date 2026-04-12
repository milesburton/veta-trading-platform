import type {
  FeatureName,
  FeatureVector,
  Signal,
  SignalFactor,
} from "@veta/types/intelligence";
import type { WeightMap } from "./weight-store.ts";

const FEATURE_SCALES: Record<FeatureName, number> = {
  momentum: 0.05,
  relativeVolume: 3.0,
  realisedVol: 0.8,
  sectorRelativeStrength: 0.03,
  eventScore: 2.0,
  newsVelocity: 10,
  sentimentDelta: 1.0,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalise(feature: FeatureName, value: number): number {
  return clamp(value / FEATURE_SCALES[feature], -1, 1);
}

export function scoreFeatureVector(
  fv: FeatureVector,
  weights: WeightMap,
): Signal {
  const featureNames: FeatureName[] = [
    "momentum",
    "relativeVolume",
    "realisedVol",
    "sectorRelativeStrength",
    "eventScore",
    "newsVelocity",
    "sentimentDelta",
  ];

  const totalAbsWeight = featureNames.reduce(
    (sum, f) => sum + Math.abs(weights[f]),
    0,
  );

  const factors: SignalFactor[] = featureNames.map((name) => {
    const normValue = normalise(name, fv[name] as number);
    const weight = weights[name];
    return { name, weight, contribution: normValue * weight };
  });

  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = totalAbsWeight > 0
    ? clamp(rawScore / totalAbsWeight, -1, 1)
    : 0;
  const direction = score > 0.2 ? "long" : score < -0.2 ? "short" : "neutral";

  return {
    symbol: fv.symbol,
    score,
    direction,
    confidence: Math.min(1, Math.abs(score)),
    factors,
    ts: fv.ts,
  };
}
