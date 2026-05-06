import { assertAlmostEquals, assertEquals, assertNotEquals } from "jsr:@std/assert@0.217";
import { currentSeed, nextRandom, seedRng } from "../market-sim/rng.ts";

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
