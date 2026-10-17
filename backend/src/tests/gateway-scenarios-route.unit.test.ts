import { beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";
import type { GatewayContext } from "../gateway/context.ts";

const store = vi.hoisted(() => ({
  createScenario: vi.fn(),
  deleteScenario: vi.fn(),
  getScenario: vi.fn(),
  listRuns: vi.fn(),
  listScenarios: vi.fn(),
  updateScenario: vi.fn(),
}));
const runScenario = vi.hoisted(() => vi.fn());

vi.mock("../scenarios/store.ts", () => store);
vi.mock("../scenarios/orchestrator.ts", () => ({ runScenario }));

const { handleScenariosRoute } = await import("../gateway/routes/scenarios.ts");

const SPEC = {
  seed: 1,
  symbol: "AAPL",
  side: "BUY",
  quantity: 100,
  limitPrice: 190,
  strategy: "TWAP",
};

function context(role: string | null): GatewayContext {
  return {
    urls: { marketSim: "http://sim", journal: "http://journal" },
    producer: { id: "producer" },
    requireAuth: () =>
      Promise.resolve(
        role === null
          ? new Response("{}", { status: 401 })
          : {
              user: { id: "u-3", name: "T", role, avatar_emoji: "x" },
              limits: { max_order_qty: 1, max_daily_notional: 1, allowed_strategies: [] },
            }
      ),
  } as unknown as GatewayContext;
}

function call(role: string | null, method: string, path: string, body?: unknown) {
  const req = new Request(`http://gw${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return handleScenariosRoute(req, path.split("?")[0], context(role));
}

beforeEach(() => {
  for (const fn of [...Object.values(store), runScenario]) fn.mockReset();
});

test("[scenarios-route] ignores unrelated paths and rejects unauthenticated callers", async () => {
  assertEquals(await call("trader", "GET", "/other"), null);
  assertEquals((await call(null, "GET", "/scenarios"))?.status, 401);
});

test("[scenarios-route] lists scenarios for the calling user", async () => {
  store.listScenarios.mockResolvedValue([{ id: "a" }]);
  const res = await call("viewer", "GET", "/scenarios");
  assertEquals(res?.status, 200);
  assertEquals(await res?.json(), { scenarios: [{ id: "a" }] });
  assertEquals(store.listScenarios.mock.calls[0], ["u-3"]);
});

test("[scenarios-route] creating requires a trader or admin and a valid body", async () => {
  assertEquals((await call("viewer", "POST", "/scenarios", {}))?.status, 403);

  store.createScenario.mockResolvedValue({ id: "new" });
  const created = await call("trader", "POST", "/scenarios", { name: "Baseline", spec: SPEC });
  assertEquals(created?.status, 201);
  assertEquals(await created?.json(), { scenario: { id: "new" } });
  assertEquals(store.createScenario.mock.calls[0][0].userId, "u-3");
  assertEquals(store.createScenario.mock.calls[0][0].name, "Baseline");
});

test("[scenarios-route] a duplicate name is a 409 and other failures propagate", async () => {
  store.createScenario.mockRejectedValue(new Error('violates "scenarios_user_id_name_key"'));
  const conflict = await call("admin", "POST", "/scenarios", { name: "Baseline", spec: SPEC });
  assertEquals(conflict?.status, 409);

  store.createScenario.mockRejectedValue(new Error("disk full"));
  let thrown: unknown;
  try {
    await call("admin", "POST", "/scenarios", { name: "Baseline", spec: SPEC });
  } catch (err) {
    thrown = err;
  }
  assertEquals((thrown as Error).message, "disk full");
});

test("[scenarios-route] reads one scenario or reports it missing", async () => {
  store.getScenario.mockResolvedValueOnce({ id: "a1" });
  const found = await call("viewer", "GET", "/scenarios/a1");
  assertEquals(await found?.json(), { scenario: { id: "a1" } });
  assertEquals(store.getScenario.mock.calls[0], ["u-3", "a1"]);

  store.getScenario.mockResolvedValueOnce(null);
  assertEquals((await call("viewer", "GET", "/scenarios/a1"))?.status, 404);
});

test("[scenarios-route] updates need the trader role, valid input and an existing scenario", async () => {
  assertEquals((await call("viewer", "PUT", "/scenarios/a1", { name: "x" }))?.status, 403);

  store.updateScenario.mockResolvedValueOnce({ id: "a1", name: "Renamed" });
  const updated = await call("trader", "PUT", "/scenarios/a1", { name: "Renamed" });
  assertEquals(updated?.status, 200);
  assertEquals(store.updateScenario.mock.calls[0].slice(0, 2), ["u-3", "a1"]);

  store.updateScenario.mockResolvedValueOnce(null);
  assertEquals((await call("trader", "PUT", "/scenarios/a1", { name: "Renamed" }))?.status, 404);

  const invalid = await call("trader", "PUT", "/scenarios/a1", { name: "" });
  assertEquals(invalid?.status, 400);
});

test("[scenarios-route] deletes need the trader role and report missing scenarios", async () => {
  assertEquals((await call("viewer", "DELETE", "/scenarios/a1"))?.status, 403);

  store.deleteScenario.mockResolvedValueOnce(true);
  const deleted = await call("admin", "DELETE", "/scenarios/a1");
  assertEquals(deleted?.status, 204);
  assertEquals(await deleted?.text(), "");
  store.deleteScenario.mockResolvedValueOnce(false);
  assertEquals((await call("admin", "DELETE", "/scenarios/a1"))?.status, 404);
});

test("[scenarios-route] unsupported methods on a scenario id are a 405", async () => {
  assertEquals((await call("trader", "PATCH", "/scenarios/a1"))?.status, 405);
});

test("[scenarios-route] running a scenario needs a trader and passes the service endpoints through", async () => {
  assertEquals((await call("viewer", "POST", "/scenarios/a1/run"))?.status, 403);

  store.getScenario.mockResolvedValueOnce(null);
  assertEquals((await call("trader", "POST", "/scenarios/a1/run"))?.status, 404);

  store.getScenario.mockResolvedValueOnce({ id: "a1" });
  runScenario.mockResolvedValueOnce({ id: "run-1" });
  const ok = await call("trader", "POST", "/scenarios/a1/run");
  assertEquals(await ok?.json(), { run: { id: "run-1" } });
  assertEquals(runScenario.mock.calls[0][1], {
    producer: { id: "producer" },
    marketSimUrl: "http://sim",
    journalUrl: "http://journal",
  });

  store.getScenario.mockResolvedValueOnce({ id: "a1" });
  runScenario.mockRejectedValueOnce(new Error("sim unavailable"));
  const failed = await call("trader", "POST", "/scenarios/a1/run");
  assertEquals(failed?.status, 500);
  assert(((await failed?.text()) ?? "").includes("sim unavailable"));
});

test("[scenarios-route] lists runs with a default and an explicit limit", async () => {
  store.listRuns.mockResolvedValue([{ id: "r1" }]);
  const res = await call("viewer", "GET", "/scenarios/a1/runs");
  assertEquals(await res?.json(), { runs: [{ id: "r1" }] });
  assertEquals(store.listRuns.mock.calls[0], ["u-3", "a1", 20]);

  await call("viewer", "GET", "/scenarios/a1/runs?limit=5");
  assertEquals(store.listRuns.mock.calls[1], ["u-3", "a1", 5]);
});

test("[scenarios-route] unmatched scenario sub-paths fall through", async () => {
  assertEquals(await call("trader", "POST", "/scenarios/a1/runs"), null);
  assertEquals(await call("trader", "GET", "/scenarios/A1/extra/deep"), null);
});
