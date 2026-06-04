import { assertEquals } from "jsr:@std/assert@0.217";
import type { FeatureVector } from "@veta/types/intelligence";
import { buildBatchInsert, createFeatureStore } from "../feature-engine/feature-store.ts";

interface StoredFeatureVector extends FeatureVector {
  id: number;
}

interface FakeClient {
  queryArray<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

interface FakePool {
  connect(): Promise<FakeClient>;
  __setCleanupFailure(shouldFail: boolean): void;
  __releaseCount(): number;
}

function makeFeature(symbol: string, ts: number, momentum: number): FeatureVector {
  return {
    symbol,
    ts,
    momentum,
    relativeVolume: 1.1,
    realisedVol: 0.22,
    sectorRelativeStrength: 0.15,
    eventScore: 0.3,
    newsVelocity: 2,
    sentimentDelta: 0.4,
  };
}

function makeFakePool(seed: FeatureVector[] = []): FakePool {
  let nextId = 1;
  let cleanupFails = false;
  let releases = 0;
  const rows: StoredFeatureVector[] = seed.map((fv) => ({
    ...fv,
    id: nextId++,
  }));

  return {
    async connect(): Promise<FakeClient> {
      await Promise.resolve();
      return {
        async queryArray<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
          await Promise.resolve();
          if (sql.includes("INSERT INTO intelligence.feature_vectors")) {
            if (params.length === 9) {
              rows.push({
                id: nextId++,
                symbol: String(params[0]),
                ts: Number(params[1]),
                momentum: Number(params[2]),
                relativeVolume: Number(params[3]),
                realisedVol: Number(params[4]),
                sectorRelativeStrength: Number(params[5]),
                eventScore: Number(params[6]),
                newsVelocity: Number(params[7]),
                sentimentDelta: Number(params[8]),
              });
            } else {
              for (let index = 0; index < params.length; index += 9) {
                rows.push({
                  id: nextId++,
                  symbol: String(params[index]),
                  ts: Number(params[index + 1]),
                  momentum: Number(params[index + 2]),
                  relativeVolume: Number(params[index + 3]),
                  realisedVol: Number(params[index + 4]),
                  sectorRelativeStrength: Number(params[index + 5]),
                  eventScore: Number(params[index + 6]),
                  newsVelocity: Number(params[index + 7]),
                  sentimentDelta: Number(params[index + 8]),
                });
              }
            }
            return { rows: [] as T[] };
          }

          if (sql.includes("ORDER BY ts DESC LIMIT 1")) {
            const symbol = String(params[0]);
            const latest = rows
              .filter((row) => row.symbol === symbol)
              .sort((a, b) => b.ts - a.ts)[0];
            if (!latest) return { rows: [] as T[] };
            return {
              rows: [
                [
                  latest.symbol,
                  latest.ts,
                  latest.momentum,
                  latest.relativeVolume,
                  latest.realisedVol,
                  latest.sectorRelativeStrength,
                  latest.eventScore,
                  latest.newsVelocity,
                  latest.sentimentDelta,
                ],
              ] as unknown as T[],
            };
          }

          if (sql.includes("ORDER BY ts DESC LIMIT $2")) {
            const symbol = String(params[0]);
            const limit = Number(params[1]);
            const history = rows
              .filter((row) => row.symbol === symbol)
              .sort((a, b) => b.ts - a.ts)
              .slice(0, limit)
              .map((row) => [
                row.symbol,
                row.ts,
                row.momentum,
                row.relativeVolume,
                row.realisedVol,
                row.sectorRelativeStrength,
                row.eventScore,
                row.newsVelocity,
                row.sentimentDelta,
              ]);
            return { rows: history as unknown as T[] };
          }

          if (sql.includes("DELETE FROM intelligence.feature_vectors")) {
            if (cleanupFails) {
              throw new Error("cleanup blew up");
            }
            const maxPerSymbol = Number(params[0]);
            const bySymbol = new Map<string, StoredFeatureVector[]>();
            for (const row of rows) {
              const existing = bySymbol.get(row.symbol) ?? [];
              existing.push(row);
              bySymbol.set(row.symbol, existing);
            }
            const keptIds = new Set<number>();
            for (const group of bySymbol.values()) {
              for (const row of group.sort((a, b) => b.ts - a.ts).slice(0, maxPerSymbol)) {
                keptIds.add(row.id);
              }
            }
            for (let index = rows.length - 1; index >= 0; index--) {
              if (!keptIds.has(rows[index].id)) rows.splice(index, 1);
            }
            return { rows: [] as T[] };
          }

          throw new Error(`Unhandled SQL in fake feature store pool: ${sql}`);
        },
        release() {
          releases++;
        },
      };
    },
    __setCleanupFailure(shouldFail: boolean) {
      cleanupFails = shouldFail;
    },
    __releaseCount() {
      return releases;
    },
  };
}

Deno.test("[feature-store] buildBatchInsert returns placeholders and values", () => {
  const batch = [makeFeature("AAPL", 1000, 0.1), makeFeature("MSFT", 2000, 0.2)];
  const { placeholders, values } = buildBatchInsert(batch);

  assertEquals(placeholders, "($1,$2,$3,$4,$5,$6,$7,$8,$9),($10,$11,$12,$13,$14,$15,$16,$17,$18)");
  assertEquals(values.length, 18);
});

Deno.test("[feature-store] insert, insertBatch, getLatest and getHistory round-trip", async () => {
  const pool = makeFakePool();
  const store = createFeatureStore(pool as unknown as Parameters<typeof createFeatureStore>[0]);

  await store.insert(makeFeature("AAPL", 1000, 0.1));
  await store.insertBatch([
    makeFeature("AAPL", 2000, 0.2),
    makeFeature("AAPL", 3000, 0.3),
    makeFeature("MSFT", 2500, 0.4),
  ]);

  const latest = await store.getLatest("AAPL");
  const history = await store.getHistory("AAPL", 2);
  const missing = await store.getLatest("NVDA");

  assertEquals(latest?.ts, 3000);
  assertEquals(latest?.momentum, 0.3);
  assertEquals(
    history.map((row) => row.ts),
    [3000, 2000]
  );
  assertEquals(missing, null);
});

Deno.test("[feature-store] insertBatch no-ops on empty input", async () => {
  const pool = makeFakePool();
  const store = createFeatureStore(pool as unknown as Parameters<typeof createFeatureStore>[0]);
  const releasesBefore = pool.__releaseCount();
  await store.insertBatch([]);
  assertEquals(pool.__releaseCount(), releasesBefore);
});

Deno.test("[feature-store] startCleanup prunes old rows per symbol and swallows cleanup errors", async () => {
  const seed = [
    makeFeature("AAPL", 1000, 0.1),
    makeFeature("AAPL", 2000, 0.2),
    makeFeature("AAPL", 3000, 0.3),
    makeFeature("MSFT", 1500, 0.4),
  ];
  const pool = makeFakePool(seed);
  const store = createFeatureStore(pool as unknown as Parameters<typeof createFeatureStore>[0]);

  const realSetInterval = globalThis.setInterval;
  let callback: (() => Promise<void>) | undefined;
  const globalWithInterval = globalThis as typeof globalThis & {
    setInterval(cb: () => Promise<void>): number;
  };
  globalWithInterval.setInterval = ((cb: () => Promise<void>) => {
    callback = cb;
    return 1;
  }) as typeof setInterval;

  try {
    store.startCleanup(10);
    await callback?.();
    const history = await store.getHistory("AAPL", 10);
    assertEquals(
      history.map((row) => row.ts),
      [3000, 2000, 1000]
    );

    pool.__setCleanupFailure(true);
    await callback?.();
  } finally {
    globalThis.setInterval = realSetInterval;
  }
});
