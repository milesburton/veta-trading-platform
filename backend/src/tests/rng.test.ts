import { runNode } from "#veta/run-node";
import { test } from "#veta/test";
import { assertAlmostEquals, assertEquals, assertNotEquals } from "#veta/test-assert";
import { __applyEnvSeedForTests, currentSeed, nextRandom, seedRng } from "../market-sim/rng.ts";

function take(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(nextRandom());
  return out;
}

test("seedRng → identical seed produces identical sequence", () => {
  seedRng(42);
  const a = take(100);
  seedRng(42);
  const b = take(100);
  assertEquals(a, b);
});

test("seedRng → different seeds produce different sequences", () => {
  seedRng(42);
  const a = take(100);
  seedRng(1337);
  const b = take(100);
  assertNotEquals(a, b);
});

test("seedRng(null) reverts to non-deterministic mode", () => {
  seedRng(null);
  assertEquals(currentSeed(), null);
  const a = nextRandom();
  const b = nextRandom();
  assertNotEquals(a, b);
});

test("nextRandom output stays inside [0, 1)", () => {
  seedRng(7);
  for (let i = 0; i < 1_000; i++) {
    const v = nextRandom();
    assertEquals(v >= 0, true);
    assertEquals(v < 1, true);
  }
  seedRng(null);
});

test("seeded mean approximates 0.5 over many draws", () => {
  seedRng(123);
  let sum = 0;
  const n = 10_000;
  for (let i = 0; i < n; i++) sum += nextRandom();
  assertAlmostEquals(sum / n, 0.5, 0.02);
  seedRng(null);
});

test("MARKET_SIM_SEED env applies a deterministic seed at module load (subprocess)", async () => {
  const { stdout } = await runNode(`
      import { currentSeed, nextRandom } from "${
        new URL("../market-sim/rng.ts", import.meta.url).href
      }";
      console.log(JSON.stringify({ seed: currentSeed(), first: nextRandom() }));
    `, { MARKET_SIM_SEED: "12345" });
  const out = JSON.parse(stdout);
  if (out.seed !== 12_345) {
    throw new Error(`expected seed 12345, got ${out.seed}`);
  }
  if (typeof out.first !== "number" || out.first < 0 || out.first >= 1) {
    throw new Error(`expected a number in [0,1), got ${out.first}`);
  }
});

test("MARKET_SIM_SEED with non-numeric value leaves RNG unseeded (subprocess)", async () => {
  const { stdout } = await runNode(`
      import { currentSeed } from "${new URL("../market-sim/rng.ts", import.meta.url).href}";
      console.log(JSON.stringify({ seed: currentSeed() }));
    `, { MARKET_SIM_SEED: "not-a-number" });
  const out = JSON.parse(stdout);
  if (out.seed !== null) throw new Error(`expected null seed, got ${out.seed}`);
});

test("MARKET_SIM_SEED empty string leaves RNG unseeded (subprocess)", async () => {
  const { stdout } = await runNode(`
      import { currentSeed } from "${new URL("../market-sim/rng.ts", import.meta.url).href}";
      console.log(JSON.stringify({ seed: currentSeed() }));
    `, { MARKET_SIM_SEED: "" });
  const out = JSON.parse(stdout);
  if (out.seed !== null) throw new Error(`expected null seed, got ${out.seed}`);
});

test("MARKET_SIM_SEED in-process helper applies finite seed and ignores blank/unset/non-finite values", () => {
  const previous = process.env.MARKET_SIM_SEED;
  try {
    seedRng(null);
    delete process.env["MARKET_SIM_SEED"];
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), null);

    process.env["MARKET_SIM_SEED"] = "";
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), null);

    process.env["MARKET_SIM_SEED"] = "not-finite";
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), null);

    process.env["MARKET_SIM_SEED"] = "99.8";
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), 99);
  } finally {
    if (previous === undefined) delete process.env["MARKET_SIM_SEED"];
    else process.env["MARKET_SIM_SEED"] = previous;
    seedRng(null);
  }
});
