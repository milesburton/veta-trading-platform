import { assert, assertEquals } from "jsr:@std/assert@0.217";
import {
  createRuntimeConfigStore,
  deriveSubsystemState,
  resolveEffectivePolicy,
} from "../llm-advisory/runtime-config-store.ts";
import type { LlmPolicy, LlmRuntimeConfig } from "../types/llm-advisory.ts";

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

Deno.test("[runtime-config-store] missing row falls back to a fresh default config", async () => {
  const pool = makeFakePool();
  pool.__setRow(null);
  const t0 = 5_000_000;
  // deno-lint-ignore no-explicit-any
  const store = await createRuntimeConfigStore(pool as any, { now: () => t0, cacheTtlMs: 0 });
  const cfg = await store.getConfig();
  assertEquals(cfg.enabled, false);
  assertEquals(cfg.workerEnabled, false);
  assertEquals(cfg.triggerMode, "manual");
  assertEquals(cfg.updatedBy, "system");
  assertEquals(cfg.updatedAt, t0);
});

Deno.test("[runtime-config-store] resolveEffectivePolicy overlays runtime enabled/workerEnabled/triggerMode onto base", () => {
  const base: LlmPolicy = {
    enabled: false,
    workerEnabled: false,
    triggerMode: "manual",
    provider: "ollama",
    modelId: "qwen-coder",
    ollamaBaseUrl: "http://x",
    maxConcurrentJobs: 3,
    maxNoteAgeMs: 60_000,
    minRefreshMinutes: 5,
    workerIdleTimeoutSeconds: 120,
    workerMaxJobsPerSession: 20,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.6,
    dedupeWindowMs: 30_000,
    autoTriggerEnabled: true,
  };
  const runtime: LlmRuntimeConfig = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "event-driven",
    updatedAt: 0,
    updatedBy: "u",
  };
  const eff = resolveEffectivePolicy(base, runtime);
  assertEquals(eff.enabled, true);
  assertEquals(eff.workerEnabled, true);
  assertEquals(eff.triggerMode, "event-driven");
  // Non-overlay fields are preserved.
  assertEquals(eff.provider, "ollama");
  assertEquals(eff.modelId, "qwen-coder");
  assertEquals(eff.minRefreshMinutes, 5);
});

function policyFor(enabled: boolean, minRefreshMinutes = 5): LlmPolicy {
  return {
    enabled,
    workerEnabled: true,
    triggerMode: "manual",
    provider: "mock",
    modelId: "mock",
    ollamaBaseUrl: "",
    maxConcurrentJobs: 1,
    maxNoteAgeMs: 60_000,
    minRefreshMinutes,
    workerIdleTimeoutSeconds: 60,
    workerMaxJobsPerSession: 10,
    allowedHours: null,
    signalConvictionThreshold: 0.7,
    confidenceThreshold: 0.6,
    dedupeWindowMs: 30_000,
    autoTriggerEnabled: true,
  };
}

Deno.test("[runtime-config-store] deriveSubsystemState: disabled when policy.enabled=false", () => {
  assertEquals(deriveSubsystemState(policyFor(false), 5, null, null), "disabled");
});

Deno.test("[runtime-config-store] deriveSubsystemState: error when last error within 30s", () => {
  assertEquals(deriveSubsystemState(policyFor(true), 0, Date.now() - 5_000, null), "error");
});

Deno.test("[runtime-config-store] deriveSubsystemState: active when pendingJobs > 0", () => {
  assertEquals(deriveSubsystemState(policyFor(true), 2, null, null), "active");
});

Deno.test("[runtime-config-store] deriveSubsystemState: cooldown when last activity inside minRefresh window", () => {
  assertEquals(
    deriveSubsystemState(policyFor(true, 5), 0, null, Date.now() - 60_000),
    "cooldown",
  );
});

Deno.test("[runtime-config-store] deriveSubsystemState: armed when none of the conditions apply", () => {
  assertEquals(deriveSubsystemState(policyFor(true, 1), 0, null, null), "armed");
});

Deno.test("[runtime-config-store] deriveSubsystemState: armed when last error is old (>30s)", () => {
  assertEquals(
    deriveSubsystemState(policyFor(true), 0, Date.now() - 120_000, null),
    "armed",
  );
});

Deno.test("[runtime-config-store] deriveSubsystemState: armed when last activity is older than minRefresh", () => {
  assertEquals(
    deriveSubsystemState(policyFor(true, 1), 0, null, Date.now() - 5 * 60_000),
    "armed",
  );
});
