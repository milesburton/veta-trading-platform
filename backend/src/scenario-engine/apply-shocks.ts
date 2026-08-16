import type { FeatureVector, ScenarioShock } from "@veta/types/intelligence";

/**
 * Applies a set of scenario shocks to a feature vector, returning a new
 * shocked vector. A shock targeting a factor name that isn't present on
 * the vector is silently ignored (the `in` check), rather than adding an
 * unexpected key. Multiple shocks to the same factor accumulate.
 */
export function applyShocks(fv: FeatureVector, shocks: ScenarioShock[]): FeatureVector {
  const shockedFv: FeatureVector = { ...fv };
  for (const shock of shocks) {
    if (shock.factor in shockedFv) {
      (shockedFv as unknown as Record<string, number>)[shock.factor] =
        (shockedFv as unknown as Record<string, number>)[shock.factor] + shock.delta;
    }
  }
  return shockedFv;
}
