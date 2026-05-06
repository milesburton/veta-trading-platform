import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { loginAsVerified } from "./test-helpers.ts";

const GATEWAY_URL = "http://localhost:5011";

interface ScenarioRun {
  id: string;
  scenarioId: string;
  status: "pending" | "completed" | "failed" | "mismatched";
  actual: {
    fillCount: number;
    totalFilled: number;
    avgFillPriceBps: number;
    slippageBps: number;
    childOrderIds: string[];
  } | null;
  parentOrderId: string | null;
  error: string | null;
}

function authedFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie: `veta_user=${token}`,
      "content-type": init?.body ? "application/json" : "",
    },
    signal: AbortSignal.timeout(45_000),
  });
}

async function createScenario(token: string, name: string, seed: number): Promise<string> {
  const res = await authedFetch(token, "/scenarios", {
    method: "POST",
    body: JSON.stringify({
      name,
      spec: {
        seed,
        symbol: "AAPL",
        side: "BUY",
        quantity: 50,
        limitPrice: 200,
        strategy: "LIMIT",
      },
    }),
  });
  assertEquals(res.status, 201, `Expected 201 but got ${res.status}`);
  const body = await res.json() as { scenario: { id: string } };
  return body.scenario.id;
}

async function runOnce(token: string, scenarioId: string): Promise<ScenarioRun> {
  const res = await authedFetch(token, `/scenarios/${scenarioId}/run`, { method: "POST" });
  assertEquals(res.status, 200, `Expected 200 but got ${res.status}`);
  const body = await res.json() as { run: ScenarioRun };
  return body.run;
}

async function deleteScenario(token: string, scenarioId: string): Promise<void> {
  const res = await authedFetch(token, `/scenarios/${scenarioId}`, { method: "DELETE" });
  await res.body?.cancel();
}

Deno.test({
  name: "scenarios: same seed produces identical fills across three runs",
  async fn() {
    const token = await loginAsVerified("alice");
    const name = `det-replay-${Date.now()}`;
    const scenarioId = await createScenario(token, name, 12345);

    try {
      const a = await runOnce(token, scenarioId);
      const b = await runOnce(token, scenarioId);
      const c = await runOnce(token, scenarioId);

      for (const r of [a, b, c]) {
        assertEquals(r.status === "completed" || r.status === "mismatched", true, `run ${r.id} status=${r.status} error=${r.error}`);
        assert(r.actual, `run ${r.id} has no actual outcome`);
      }

      assertEquals(a.actual!.fillCount, b.actual!.fillCount, "fillCount drift between runs A and B");
      assertEquals(b.actual!.fillCount, c.actual!.fillCount, "fillCount drift between runs B and C");
      assertEquals(a.actual!.totalFilled, b.actual!.totalFilled, "totalFilled drift A↔B");
      assertEquals(b.actual!.totalFilled, c.actual!.totalFilled, "totalFilled drift B↔C");
      assertEquals(a.actual!.avgFillPriceBps, b.actual!.avgFillPriceBps, "avg-fill-price-bps drift A↔B");
      assertEquals(b.actual!.avgFillPriceBps, c.actual!.avgFillPriceBps, "avg-fill-price-bps drift B↔C");
    } finally {
      await deleteScenario(token, scenarioId);
    }
  },
});

Deno.test({
  name: "scenarios: different seeds produce different fills",
  async fn() {
    const token = await loginAsVerified("alice");
    const ts = Date.now();
    const idA = await createScenario(token, `det-A-${ts}`, 11111);
    const idB = await createScenario(token, `det-B-${ts}`, 22222);

    try {
      const a = await runOnce(token, idA);
      const b = await runOnce(token, idB);

      assert(a.actual && b.actual, "both runs need actual outcomes");
      const same =
        a.actual.fillCount === b.actual.fillCount &&
        a.actual.totalFilled === b.actual.totalFilled &&
        a.actual.avgFillPriceBps === b.actual.avgFillPriceBps;
      assertEquals(same, false, "different seeds produced bit-identical outcomes — seeded RNG isn't actually being used");
    } finally {
      await deleteScenario(token, idA);
      await deleteScenario(token, idB);
    }
  },
});
