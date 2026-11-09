import { beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  rowCount: 0,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  released: 0,
}));

vi.mock("#veta/db", () => ({
  scenariosPool: {
    connect: () =>
      Promise.resolve({
        queryObject: (sql: string, params: unknown[]) => {
          h.queries.push({ sql, params });
          return Promise.resolve({ rows: h.rows });
        },
        queryArray: (sql: string, params: unknown[]) => {
          h.queries.push({ sql, params });
          return Promise.resolve({ rows: [], rowCount: h.rowCount });
        },
        release: () => {
          h.released += 1;
        },
      }),
  },
}));

const store = await import("../gateway/scenarios/store.ts");

const SPEC = { symbol: "AAPL" } as never;

const scenarioRow = (overrides: Record<string, unknown> = {}) => ({
  id: "sc-1",
  user_id: "u1",
  name: "n",
  description: null,
  spec: SPEC,
  expected: null,
  created_at: "c",
  updated_at: "u",
  ...overrides,
});

const runRow = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  scenario_id: "sc-1",
  user_id: "u1",
  triggered_at: "t",
  completed_at: null,
  parent_order_id: null,
  actual: null,
  diff: null,
  status: "pending",
  error: null,
  ...overrides,
});

beforeEach(() => {
  h.rows = [];
  h.rowCount = 0;
  h.queries.length = 0;
  h.released = 0;
});

test("[scenario-store] creates a scenario with serialised spec and optional expectation", async () => {
  h.rows = [scenarioRow()];
  const created = await store.createScenario({ userId: "u1", name: "n", spec: SPEC });
  assertEquals(created.userId, "u1");
  assertEquals(created.createdAt, "c");
  const { params } = h.queries[0];
  assert(String(params[0]).startsWith("sc-"));
  assertEquals(params.slice(3), [null, JSON.stringify(SPEC), null]);

  await store.createScenario({
    userId: "u1",
    name: "n",
    description: "d",
    spec: SPEC,
    expected: { fills: 1 } as never,
  });
  assertEquals(h.queries[1].params.slice(3), ["d", JSON.stringify(SPEC), '{"fills":1}']);
  assertEquals(h.released, 2);
});

test("[scenario-store] lists and fetches scenarios scoped to the user", async () => {
  h.rows = [scenarioRow(), scenarioRow({ id: "sc-2" })];
  const all = await store.listScenarios("u1");
  assertEquals(
    all.map((s) => s.id),
    ["sc-1", "sc-2"]
  );
  assertEquals(h.queries[0].params, ["u1"]);

  h.rows = [scenarioRow()];
  assertEquals((await store.getScenario("u1", "sc-1"))?.id, "sc-1");
  h.rows = [];
  assertEquals(await store.getScenario("u1", "missing"), null);
});

test("[scenario-store] updates only the supplied fields", async () => {
  h.rows = [scenarioRow({ name: "renamed" })];
  const updated = await store.updateScenario("u1", "sc-1", {
    name: "renamed",
    description: "d",
    spec: SPEC,
    expected: { fills: 2 } as never,
  });
  assertEquals(updated?.name, "renamed");
  const { sql, params } = h.queries[0];
  assert(sql.includes("name = $3") && sql.includes("expected = $6"));
  assertEquals(params, ["u1", "sc-1", "renamed", "d", JSON.stringify(SPEC), '{"fills":2}']);
});

test("[scenario-store] clears the expectation when null is supplied", async () => {
  h.rows = [scenarioRow()];
  await store.updateScenario("u1", "sc-1", { expected: null });
  assertEquals(h.queries[0].params, ["u1", "sc-1", null]);
});

test("[scenario-store] returns null when updating a scenario that is not there", async () => {
  h.rows = [];
  assertEquals(await store.updateScenario("u1", "gone", { name: "x" }), null);
});

test("[scenario-store] reads the scenario instead of writing when nothing changes", async () => {
  h.rows = [scenarioRow()];
  const unchanged = await store.updateScenario("u1", "sc-1", {});
  assertEquals(unchanged?.id, "sc-1");
  assert(h.queries[0].sql.includes("SELECT"));
});

test("[scenario-store] reports whether a delete removed a row", async () => {
  h.rowCount = 1;
  assertEquals(await store.deleteScenario("u1", "sc-1"), true);
  h.rowCount = 0;
  assertEquals(await store.deleteScenario("u1", "sc-1"), false);
});

test("[scenario-store] records the algo evidence a run was executed against", async () => {
  h.rows = [runRow()];
  await store.createRun("sc-1", "u1", {
    algoId: "VETA-TWAP",
    algoVersion: "1.0.0",
    commitSha: "abc123",
  });
  assertEquals(h.queries[0].params.slice(3), ["VETA-TWAP", "1.0.0", "abc123"]);
  h.rows = [runRow()];
  await store.createRun("sc-1", "u1");
  assertEquals(h.queries[1].params.slice(3), [null, null, null]);
});

test("[scenario-store] creates and completes runs", async () => {
  h.rows = [runRow()];
  const run = await store.createRun("sc-1", "u1");
  assertEquals(run.status, "pending");
  assert(String(h.queries[0].params[0]).startsWith("run-"));

  h.rows = [runRow({ status: "passed", completed_at: "done" })];
  const done = await store.completeRun("run-1", {
    parentOrderId: "o1",
    actual: { fills: 1 } as never,
    diff: { ok: true } as never,
    status: "passed" as never,
  });
  assertEquals(done?.completedAt, "done");
  assertEquals(h.queries[1].params.slice(1), ["o1", '{"fills":1}', '{"ok":true}', "passed", null]);

  await store.completeRun("run-1", {
    parentOrderId: null,
    actual: null,
    diff: null,
    status: "error" as never,
    error: "boom",
  });
  assertEquals(h.queries[2].params.slice(1), [null, null, null, "error", "boom"]);

  h.rows = [];
  assertEquals(
    await store.completeRun("missing", {
      parentOrderId: null,
      actual: null,
      diff: null,
      status: "error" as never,
    }),
    null
  );
});

test("[scenario-store] lists runs with a clamped page size", async () => {
  h.rows = [runRow()];
  const runs = await store.listRuns("u1", "sc-1");
  assertEquals(runs[0].scenarioId, "sc-1");
  assertEquals(h.queries[0].params, ["u1", "sc-1", 20]);
  await store.listRuns("u1", "sc-1", 9999);
  assertEquals(h.queries[1].params[2], 100);
  await store.listRuns("u1", "sc-1", 0);
  assertEquals(h.queries[2].params[2], 1);
});
