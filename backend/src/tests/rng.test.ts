import { assertAlmostEquals, assertEquals, assertNotEquals } from "jsr:@std/assert@0.217";
import { __applyEnvSeedForTests, currentSeed, nextRandom, seedRng } from "../market-sim/rng.ts";

function take(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(nextRandom());
  return out;
}

Deno.test("seedRng → identical seed produces identical sequence", () => {
  seedRng(42);
  const a = take(100);
  seedRng(42);
  const b = take(100);
  assertEquals(a, b);
});

Deno.test("seedRng → different seeds produce different sequences", () => {
  seedRng(42);
  const a = take(100);
  seedRng(1337);
  const b = take(100);
  assertNotEquals(a, b);
});

Deno.test("seedRng(null) reverts to non-deterministic mode", () => {
  seedRng(null);
  assertEquals(currentSeed(), null);
  const a = nextRandom();
  const b = nextRandom();
  assertNotEquals(a, b);
});

Deno.test("nextRandom output stays inside [0, 1)", () => {
  seedRng(7);
  for (let i = 0; i < 1_000; i++) {
    const v = nextRandom();
    assertEquals(v >= 0, true);
    assertEquals(v < 1, true);
  }
  seedRng(null);
});

Deno.test("seeded mean approximates 0.5 over many draws", () => {
  seedRng(123);
  let sum = 0;
  const n = 10_000;
  for (let i = 0; i < n; i++) sum += nextRandom();
  assertAlmostEquals(sum / n, 0.5, 0.02);
  seedRng(null);
});

Deno.test("MARKET_SIM_SEED env applies a deterministic seed at module load (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      "--quiet",
      `
      import { currentSeed, nextRandom } from "${
        new URL("../market-sim/rng.ts", import.meta.url).href
      }";
      console.log(JSON.stringify({ seed: currentSeed(), first: nextRandom() }));
    `,
    ],
    env: { MARKET_SIM_SEED: "12345" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const out = JSON.parse(new TextDecoder().decode(stdout));
  if (out.seed !== 12345) {
    throw new Error(`expected seed 12345, got ${out.seed}`);
  }
  if (typeof out.first !== "number" || out.first < 0 || out.first >= 1) {
    throw new Error(`expected a number in [0,1), got ${out.first}`);
  }
});

Deno.test("MARKET_SIM_SEED with non-numeric value leaves RNG unseeded (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      "--quiet",
      `
      import { currentSeed } from "${new URL("../market-sim/rng.ts", import.meta.url).href}";
      console.log(JSON.stringify({ seed: currentSeed() }));
    `,
    ],
    env: { MARKET_SIM_SEED: "not-a-number" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const out = JSON.parse(new TextDecoder().decode(stdout));
  if (out.seed !== null) throw new Error(`expected null seed, got ${out.seed}`);
});

Deno.test("MARKET_SIM_SEED empty string leaves RNG unseeded (subprocess)", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      "--quiet",
      `
      import { currentSeed } from "${new URL("../market-sim/rng.ts", import.meta.url).href}";
      console.log(JSON.stringify({ seed: currentSeed() }));
    `,
    ],
    env: { MARKET_SIM_SEED: "" },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const out = JSON.parse(new TextDecoder().decode(stdout));
  if (out.seed !== null) throw new Error(`expected null seed, got ${out.seed}`);
});

Deno.test("MARKET_SIM_SEED in-process helper applies finite seed and ignores blank/unset/non-finite values", () => {
  const previous = Deno.env.get("MARKET_SIM_SEED");
  try {
    seedRng(null);
    Deno.env.delete("MARKET_SIM_SEED");
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), null);

    Deno.env.set("MARKET_SIM_SEED", "");
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), null);

    Deno.env.set("MARKET_SIM_SEED", "not-finite");
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), null);

    Deno.env.set("MARKET_SIM_SEED", "99.8");
    __applyEnvSeedForTests();
    assertEquals(currentSeed(), 99);
  } finally {
    if (previous === undefined) Deno.env.delete("MARKET_SIM_SEED");
    else Deno.env.set("MARKET_SIM_SEED", previous);
    seedRng(null);
  }
});
