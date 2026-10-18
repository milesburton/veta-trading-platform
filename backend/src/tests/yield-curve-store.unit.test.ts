import { test } from "#veta/test";
import { assert, assertEquals, assertRejects } from "#veta/test-assert";
import { createYieldCurveStore } from "../analytics/yield-curve-store.ts";

type Pool = Parameters<typeof createYieldCurveStore>[0];

interface Recorded {
  statements: string[];
  args: unknown[][];
  released: number;
}

function fakePool(
  rows: unknown[][],
  options: { failOn?: string } = {}
): { pool: Pool; recorded: Recorded } {
  const recorded: Recorded = { statements: [], args: [], released: 0 };
  const client = {
    queryArray: (query: string, args?: unknown[]) => {
      recorded.statements.push(query.trim().split(/\s+/)[0]);
      recorded.args.push(args ?? []);
      if (options.failOn && query.includes(options.failOn)) {
        return Promise.reject(new Error("write failed"));
      }
      return Promise.resolve({ rows });
    },
    release: () => {
      recorded.released += 1;
    },
  };
  return { pool: { connect: () => Promise.resolve(client) } as unknown as Pool, recorded };
}

const PARAMS = { beta0: 4.1, beta1: -1.2, beta2: 0.8, lambda: 1.5 };

test("[yield-curve-store] insertSnapshot writes and prunes inside one transaction", async () => {
  const { pool, recorded } = fakePool([]);
  await createYieldCurveStore(pool).insertSnapshot(PARAMS, "fred");
  assertEquals(recorded.statements, ["BEGIN", "INSERT", "DELETE", "COMMIT"]);
  assertEquals(recorded.args[1].slice(0, 5), [4.1, -1.2, 0.8, 1.5, "fred"]);
  assertEquals(recorded.released, 1);
});

test("[yield-curve-store] insertSnapshot rolls back and rethrows when a write fails", async () => {
  const { pool, recorded } = fakePool([], { failOn: "INSERT" });
  await assertRejects(() => createYieldCurveStore(pool).insertSnapshot(PARAMS, "fred"));
  assertEquals(recorded.statements, ["BEGIN", "INSERT", "ROLLBACK"]);
  assertEquals(recorded.released, 1);
});

test("[yield-curve-store] getClosestSnapshot maps the row to numbers", async () => {
  const { pool, recorded } = fakePool([["4.1", "-1.2", "0.8", "1.5", "fred", 1_700_000_000_000n]]);
  const snapshot = await createYieldCurveStore(pool).getClosestSnapshot(1_800_000_000_000);
  assertEquals(snapshot, { params: PARAMS, source: "fred", fetchedAt: 1_700_000_000_000 });
  assertEquals(recorded.args[0], [1_800_000_000_000]);
  assertEquals(recorded.released, 1);
});

test("[yield-curve-store] getClosestSnapshot returns null when there are no snapshots", async () => {
  const { pool, recorded } = fakePool([]);
  assertEquals(await createYieldCurveStore(pool).getClosestSnapshot(1), null);
  assert(recorded.released === 1);
});
