import { assert, assertEquals } from "jsr:@std/assert@0.217";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

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

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";

function gateway(stack: TestStack): string {
  const url = stack.urls.gateway;
  if (!url) throw new Error("gateway URL not in stack");
  return url;
}

function authedFetch(
  stack: TestStack,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${gateway(stack)}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie: `veta_user=${token}`,
      "content-type": init?.body ? "application/json" : "",
    },
    signal: AbortSignal.timeout(60_000),
  });
}

async function createScenario(
  stack: TestStack,
  token: string,
  name: string,
  seed: number,
): Promise<string> {
  const res = await authedFetch(stack, token, "/scenarios", {
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
  assertEquals(
    res.status,
    201,
    `expected 201 from POST /scenarios but got ${res.status}`,
  );
  const body = (await res.json()) as { scenario: { id: string } };
  return body.scenario.id;
}

async function runOnce(
  stack: TestStack,
  token: string,
  scenarioId: string,
): Promise<ScenarioRun> {
  const res = await authedFetch(stack, token, `/scenarios/${scenarioId}/run`, {
    method: "POST",
  });
  assertEquals(
    res.status,
    200,
    `expected 200 from /scenarios/{id}/run but got ${res.status}`,
  );
  const body = (await res.json()) as { run: ScenarioRun };
  return body.run;
}

const SCENARIO_SERVICES = [
  "market-sim",
  "ems",
  "oms",
  "limit-strategy",
  "user-service",
  "journal",
  "risk-engine",
  "gateway",
] as const;

const FILL_PRICE_DRIFT_TOLERANCE_BPS = 60;

Deno.test({
  name:
    `scenarios (testcontainers): same seed produces fills within ${FILL_PRICE_DRIFT_TOLERANCE_BPS}bps across three runs`,
  ignore: !SHOULD_RUN,
  async fn() {
    const verbose = Deno.env.get("STACK_VERBOSE") === "1";
    const stack = await startStack({
      services: [...SCENARIO_SERVICES],
      startupTimeoutMs: 90_000,
      verbose,
    });
    try {
      const token = await login(stack, "alice");
      const scenarioId = await createScenario(
        stack,
        token,
        `tc-det-${Date.now()}`,
        12345,
      );

      const a = await runOnce(stack, token, scenarioId);
      const b = await runOnce(stack, token, scenarioId);
      const c = await runOnce(stack, token, scenarioId);

      for (const r of [a, b, c]) {
        assertEquals(
          r.status === "completed" || r.status === "mismatched",
          true,
          `run ${r.id} status=${r.status} error=${r.error}`,
        );
        assert(r.actual, `run ${r.id} has no actual outcome`);
      }
      assertEquals(a.actual?.fillCount, b.actual?.fillCount);
      assertEquals(b.actual?.fillCount, c.actual?.fillCount);
      assertEquals(a.actual?.totalFilled, b.actual?.totalFilled);
      assertEquals(b.actual?.totalFilled, c.actual?.totalFilled);
      const aBps = a.actual?.avgFillPriceBps;
      const bBps = b.actual?.avgFillPriceBps;
      const cBps = c.actual?.avgFillPriceBps;
      assert(aBps !== undefined, "run A has no avgFillPriceBps");
      assert(bBps !== undefined, "run B has no avgFillPriceBps");
      assert(cBps !== undefined, "run C has no avgFillPriceBps");
      const ab = Math.abs(aBps - bBps);
      const bc = Math.abs(bBps - cBps);
      assert(
        ab <= FILL_PRICE_DRIFT_TOLERANCE_BPS,
        `avgFillPriceBps drift A↔B = ${ab.toFixed(2)}bps (expected ≤${FILL_PRICE_DRIFT_TOLERANCE_BPS}bps)`,
      );
      assert(
        bc <= FILL_PRICE_DRIFT_TOLERANCE_BPS,
        `avgFillPriceBps drift B↔C = ${bc.toFixed(2)}bps (expected ≤${FILL_PRICE_DRIFT_TOLERANCE_BPS}bps)`,
      );
    } catch (err) {
      await Deno.stderr.write(
        new TextEncoder().encode(`\n--- service logs ---\n${stack.dumpLogs()}`),
      );
      throw err;
    } finally {
      await stack.teardown();
    }
  },
});

Deno.test({
  name: "scenarios (testcontainers): different seeds produce different fills",
  ignore: !SHOULD_RUN,
  async fn() {
    const verbose = Deno.env.get("STACK_VERBOSE") === "1";
    const stack = await startStack({
      services: [...SCENARIO_SERVICES],
      startupTimeoutMs: 90_000,
      verbose,
    });
    try {
      const token = await login(stack, "alice");
      const ts = Date.now();
      const idA = await createScenario(stack, token, `tc-A-${ts}`, 11111);
      const idB = await createScenario(stack, token, `tc-B-${ts}`, 22222);

      const a = await runOnce(stack, token, idA);
      const b = await runOnce(stack, token, idB);

      assert(a.actual && b.actual, "both runs need actual outcomes");
      const same = a.actual.fillCount === b.actual.fillCount &&
        a.actual.totalFilled === b.actual.totalFilled &&
        a.actual.avgFillPriceBps === b.actual.avgFillPriceBps;
      assertEquals(
        same,
        false,
        "different seeds produced bit-identical outcomes — RNG isn't seeded",
      );
    } catch (err) {
      await Deno.stderr.write(
        new TextEncoder().encode(`\n--- service logs ---\n${stack.dumpLogs()}`),
      );
      throw err;
    } finally {
      await stack.teardown();
    }
  },
});
