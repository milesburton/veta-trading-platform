import { Pool } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { assertEquals, assertNotEquals, assertStrictEquals } from "jsr:@std/assert@0.217";
import {
  createWeightStore,
  DEFAULT_WEIGHTS,
  type WeightMap,
} from "../signal-engine/weight-store.ts";
import { applyMigrations } from "./testcontainers/migrations.ts";
import { startEphemeralPostgres } from "./testcontainers/postgres.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

Deno.test({
  name: "[weight-store] seeds defaults and round-trips saves against real Postgres",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const pg = await startEphemeralPostgres();
    try {
      await applyMigrations(pg.url);
      const pool = new Pool(pg.url, 2, false);
      try {
        const store = await createWeightStore(pool);

        await t.step("first getWeights returns the seeded defaults", async () => {
          const w = await store.getWeights();
          assertEquals(w, DEFAULT_WEIGHTS);
        });

        await t.step("second getWeights returns the cached object (same reference)", async () => {
          const a = await store.getWeights();
          const b = await store.getWeights();
          assertStrictEquals(a, b);
        });

        await t.step(
          "saveWeights persists and invalidates the cache; getWeights then reads new values",
          async () => {
            const updated: WeightMap = {
              momentum: 0.5,
              relativeVolume: 0.05,
              realisedVol: -0.30,
              sectorRelativeStrength: 0.10,
              eventScore: 0.20,
              newsVelocity: 0.15,
              sentimentDelta: 0.05,
            };
            await store.saveWeights(updated);
            const after = await store.getWeights();
            assertEquals(after, updated);
            assertNotEquals(after, DEFAULT_WEIGHTS);
          },
        );

        await t.step(
          "createWeightStore on existing row skips the default INSERT but still reads it",
          async () => {
            const fresh = await createWeightStore(pool);
            const w = await fresh.getWeights();
            assertEquals(typeof w.momentum, "number");
            assertEquals(w.momentum, 0.5);
          },
        );
      } finally {
        await pool.end();
      }
    } finally {
      await pg.teardown();
    }
  },
});
