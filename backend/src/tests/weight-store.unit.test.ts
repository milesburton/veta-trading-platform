// fallow-ignore-file unused-file
// fallow-ignore-file complexity

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@0.217";
import {
  createWeightStore,
  DEFAULT_WEIGHTS,
  type WeightMap,
} from "../signal-engine/weight-store.ts";

interface FakeClient {
  queryArray<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

interface FakePool {
  connect(): Promise<FakeClient>;
  __getQueries(): Array<{ sql: string; params: unknown[] }>;
  __getReleaseCount(): number;
}

function makeFakePool(seedRow: WeightMap | null): FakePool {
  let row = seedRow ? { ...seedRow } : null;
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  let releaseCount = 0;

  return {
    async connect(): Promise<FakeClient> {
      await Promise.resolve();
      return {
        async queryArray<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
          await Promise.resolve();
          queries.push({ sql, params });

          if (sql.includes("SELECT id FROM intelligence.signal_weights")) {
            const rows = row ? ([[1]] as unknown as T[]) : ([] as T[]);
            return { rows };
          }

          if (
            sql.includes("INSERT INTO intelligence.signal_weights") &&
            !sql.includes("ON CONFLICT")
          ) {
            row = {
              momentum: Number(params[0]),
              relativeVolume: Number(params[1]),
              realisedVol: Number(params[2]),
              sectorRelativeStrength: Number(params[3]),
              eventScore: Number(params[4]),
              newsVelocity: Number(params[5]),
              sentimentDelta: Number(params[6]),
            };
            return { rows: [] as T[] };
          }

          if (
            sql.includes(
              "SELECT momentum, relative_volume, realised_vol, sector_rs, event_score, news_velocity, sentiment_delta"
            )
          ) {
            if (!row) return { rows: [] as T[] };
            const rows = [
              [
                row.momentum,
                row.relativeVolume,
                row.realisedVol,
                row.sectorRelativeStrength,
                row.eventScore,
                row.newsVelocity,
                row.sentimentDelta,
              ],
            ] as unknown as T[];
            return { rows };
          }

          if (sql.includes("ON CONFLICT (id) DO UPDATE")) {
            row = {
              momentum: Number(params[0]),
              relativeVolume: Number(params[1]),
              realisedVol: Number(params[2]),
              sectorRelativeStrength: Number(params[3]),
              eventScore: Number(params[4]),
              newsVelocity: Number(params[5]),
              sentimentDelta: Number(params[6]),
            };
            return { rows: [] as T[] };
          }

          throw new Error(`Unhandled SQL in fake weight store pool: ${sql}`);
        },
        release() {
          releaseCount++;
        },
      };
    },
    __getQueries() {
      return queries;
    },
    __getReleaseCount() {
      return releaseCount;
    },
  };
}

Deno.test("[weight-store] seeds defaults when the row is missing", async () => {
  const pool = makeFakePool(null);
  const store = await createWeightStore(pool as unknown as Parameters<typeof createWeightStore>[0]);

  const weights = await store.getWeights();
  assertEquals(weights, DEFAULT_WEIGHTS);
  assertEquals(
    pool.__getQueries().some((q) => q.sql.includes("INSERT INTO intelligence.signal_weights")),
    true
  );
  assertEquals(pool.__getReleaseCount() >= 2, true);
});

Deno.test("[weight-store] caches weights and invalidates after save", async () => {
  const initial: WeightMap = {
    momentum: 0.3,
    relativeVolume: 0.05,
    realisedVol: -0.2,
    sectorRelativeStrength: 0.15,
    eventScore: 0.1,
    newsVelocity: 0.1,
    sentimentDelta: 0.05,
  };
  const pool = makeFakePool(initial);
  const store = await createWeightStore(pool as unknown as Parameters<typeof createWeightStore>[0]);

  const first = await store.getWeights();
  const second = await store.getWeights();
  assertStrictEquals(first, second);

  const updated: WeightMap = {
    momentum: 0.5,
    relativeVolume: 0.07,
    realisedVol: -0.25,
    sectorRelativeStrength: 0.08,
    eventScore: 0.12,
    newsVelocity: 0.11,
    sentimentDelta: 0.09,
  };
  await store.saveWeights(updated);
  const third = await store.getWeights();

  assertEquals(third, updated);
  assertEquals(third === second, false);
});

Deno.test("[weight-store] existing row skips default seed insert", async () => {
  const pool = makeFakePool(DEFAULT_WEIGHTS);
  const store = await createWeightStore(pool as unknown as Parameters<typeof createWeightStore>[0]);

  await store.getWeights();
  const seedInsertCount = pool
    .__getQueries()
    .filter(
      (q) =>
        q.sql.includes("INSERT INTO intelligence.signal_weights") && !q.sql.includes("ON CONFLICT")
    ).length;

  assertEquals(seedInsertCount, 0);
});
