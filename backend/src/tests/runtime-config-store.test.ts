import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { createRuntimeConfigStore } from "../llm-advisory/runtime-config-store.ts";

interface FakeClient {
  queryArray<T>(_sql: string, _params?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

interface FakePool {
  connect(): Promise<FakeClient>;
  __selectCount(): number;
  __setRow(row: [boolean, boolean, string, number, string] | null): void;
}

function makeFakePool(): FakePool {
  let selectCount = 0;
  let row: [boolean, boolean, string, number, string] | null = [
    true,
    false,
    "manual",
    1_000_000,
    "system",
  ];
  return {
    async connect(): Promise<FakeClient> {
      return await Promise.resolve({
        queryArray<T>(sql: string): Promise<{ rows: T[] }> {
          if (/^SELECT/i.test(sql.trim())) {
            selectCount++;
            const rows = row === null ? [] : ([row] as unknown as T[]);
            return Promise.resolve({ rows });
          }
          return Promise.resolve({ rows: [] as T[] });
        },
        release() {},
      });
    },
    __selectCount() {
      return selectCount;
    },
    __setRow(newRow) {
      row = newRow;
    },
  };
}

Deno.test("[runtime-config-store] caches getConfig within TTL", async () => {
  const pool = makeFakePool();
  const nowMs = 1_000_000;
  // deno-lint-ignore no-explicit-any
  const store = await createRuntimeConfigStore(pool as any, {
    cacheTtlMs: 1_000,
    now: () => nowMs,
  });

  const baseSelects = pool.__selectCount();
  await store.getConfig();
  await store.getConfig();
  await store.getConfig();
  assertEquals(pool.__selectCount() - baseSelects, 1, "only one SELECT during TTL window");
});

Deno.test("[runtime-config-store] refreshes after TTL expires", async () => {
  const pool = makeFakePool();
  let nowMs = 1_000_000;
  // deno-lint-ignore no-explicit-any
  const store = await createRuntimeConfigStore(pool as any, {
    cacheTtlMs: 1_000,
    now: () => nowMs,
  });
  const baseSelects = pool.__selectCount();

  await store.getConfig();
  nowMs += 500;
  await store.getConfig();
  assertEquals(pool.__selectCount() - baseSelects, 1, "still cached at +500ms");
  nowMs += 600;
  await store.getConfig();
  assertEquals(pool.__selectCount() - baseSelects, 2, "refetches at +1100ms");
});

Deno.test("[runtime-config-store] updateConfig invalidates the cache with the new value", async () => {
  const pool = makeFakePool();
  const nowMs = 1_000_000;
  // deno-lint-ignore no-explicit-any
  const store = await createRuntimeConfigStore(pool as any, {
    cacheTtlMs: 60_000,
    now: () => nowMs,
  });
  await store.getConfig();
  const baseSelects = pool.__selectCount();

  const updated = await store.updateConfig({ enabled: false }, "test");
  assertEquals(updated.enabled, false);

  const fromCache = await store.getConfig();
  assertEquals(fromCache.enabled, false, "next getConfig sees the update without a DB round-trip");
  // updateConfig itself does one extra SELECT (fetchFresh) plus the UPDATE,
  // and the cached value is set from the patched result — the subsequent
  // getConfig must NOT trigger an additional SELECT.
  const selectsAfterUpdate = pool.__selectCount();
  await store.getConfig();
  assertEquals(pool.__selectCount(), selectsAfterUpdate, "no further SELECT after updateConfig");
  assert(selectsAfterUpdate > baseSelects, "updateConfig did a fresh fetch");
});

Deno.test("[runtime-config-store] cacheTtlMs=0 disables the cache", async () => {
  const pool = makeFakePool();
  // deno-lint-ignore no-explicit-any
  const store = await createRuntimeConfigStore(pool as any, { cacheTtlMs: 0 });
  const baseSelects = pool.__selectCount();
  await store.getConfig();
  await store.getConfig();
  await store.getConfig();
  assertEquals(pool.__selectCount() - baseSelects, 3, "every call hits the DB when cache is off");
});
