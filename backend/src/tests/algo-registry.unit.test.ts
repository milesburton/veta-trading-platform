import {
  ALGO_REGISTRY,
  algoIdentifiers,
  algoRegistration,
  isAlgorithmicStrategy,
} from "#veta/algo-registry";
import { STRATEGIES } from "#veta/primitives";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

test("[algo-registry] every strategy is registered with a unique id and a semantic version", () => {
  const ids = STRATEGIES.map((s) => ALGO_REGISTRY[s].algoId);
  assertEquals(new Set(ids).size, STRATEGIES.length);
  for (const s of STRATEGIES) {
    assert(/^\d+\.\d+\.\d+$/.test(ALGO_REGISTRY[s].version));
    assert(ALGO_REGISTRY[s].algoId.startsWith("VETA-"));
  }
});

test("[algo-registry] lookups accept lower case and hyphenated names", () => {
  assertEquals(algoRegistration("arrival-price")?.algoId, "VETA-ARRIVAL-PRICE");
  assertEquals(algoRegistration("twap")?.algoId, "VETA-TWAP");
  assertEquals(algoRegistration("NOPE"), undefined);
  assertEquals(algoRegistration(undefined), undefined);
});

test("[algo-registry] LIMIT is not an algorithmic strategy and carries no identifiers", () => {
  assertEquals(isAlgorithmicStrategy("LIMIT"), false);
  assertEquals(isAlgorithmicStrategy("TWAP"), true);
  assertEquals(isAlgorithmicStrategy("unknown"), false);
  assertEquals(algoIdentifiers("LIMIT"), {});
  assertEquals(algoIdentifiers("VWAP"), { algoId: "VETA-VWAP", algoVersion: "1.0.0" });
});
