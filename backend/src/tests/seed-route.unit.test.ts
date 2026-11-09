import { afterEach } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import { currentSeed, nextBookRandom, nextRandom, seedRng } from "../market-sim/rng.ts";
import { handleSeedRoute } from "../market-sim/seed-route.ts";

afterEach(() => seedRng(null));

const post = (body: string) =>
  handleSeedRoute(new Request("http://x/seed", { method: "POST", body }), { onReset: () => {} });

test("[seed-route] GET returns the current seed", async () => {
  seedRng(7);
  const res = await handleSeedRoute(new Request("http://x/seed"));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { seed: 7 });
});

test("[seed-route] POST rejects malformed JSON and non-numeric seeds", async () => {
  assertEquals((await post("{")).status, 400);
  assertEquals((await post('{"seed":"abc"}')).status, 400);
  assertEquals((await post('{"seed":1e999}')).status, 400);
});

test("[seed-route] POST null clears the seed", async () => {
  seedRng(3);
  const res = await post('{"seed":null}');
  assertEquals(await res.json(), { seed: null });
  assertEquals(currentSeed(), null);
});

test("[seed-route] POST seed reseeds, resets the engine and fires onReset", async () => {
  let resets = 0;
  const res = await handleSeedRoute(
    new Request("http://x/seed", { method: "POST", body: '{"seed":42}' }),
    { onReset: () => resets++ }
  );
  assertEquals(await res.json(), { seed: 42 });
  assertEquals(resets, 1);
});

test("[seed-route] other methods are rejected", async () => {
  assertEquals(
    (await handleSeedRoute(new Request("http://x/seed", { method: "PUT" }))).status,
    405
  );
});

test("[rng] seeded streams are deterministic and independent", () => {
  seedRng(11);
  const a = [nextRandom(), nextBookRandom()];
  seedRng(11);
  assertEquals([nextRandom(), nextBookRandom()], a);
  assert(a[0] !== a[1]);
});

test("[rng] unseeded streams fall back to Math.random", () => {
  seedRng(null);
  const r = nextBookRandom();
  assert(r >= 0 && r < 1);
});
