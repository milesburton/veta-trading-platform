import { logger } from "@veta/logger";
import type { MsgProducer } from "@veta/messaging";
import { diffOutcome } from "./diff.ts";
import { computeActual } from "./outcome.ts";
import { completeRun, createRun } from "./store.ts";
import type { Scenario, ScenarioRun } from "./types.ts";

const LOG = { component: "scenario-orchestrator" };

export interface OrchestratorDeps {
  producer: MsgProducer;
  marketSimUrl: string;
  journalUrl: string;
  fetchImpl?: typeof fetch;
}

interface JournalChild {
  id: string;
  status: string;
  filled: number;
  avgFillPrice?: number;
  limitPrice?: number;
}

interface JournalOrder {
  id: string;
  clientOrderId?: string;
  status: string;
  quantity: number;
  side: "BUY" | "SELL";
  limitPrice: number;
  children: JournalChild[];
}

const FILL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

async function reseed(deps: OrchestratorDeps, seed: number): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(`${deps.marketSimUrl}/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`market-sim /seed responded ${res.status}`);
  }
}

async function pollOrder(
  deps: OrchestratorDeps,
  clientOrderId: string,
  userId: string
): Promise<JournalOrder | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = `${deps.journalUrl}/orders?userId=${encodeURIComponent(userId)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(3_000) });
  if (!res.ok) return null;
  const body = (await res.json()) as JournalOrder[] | { orders?: JournalOrder[] };
  const orders = Array.isArray(body) ? body : (body.orders ?? []);
  return orders.find((o) => o.clientOrderId === clientOrderId || o.id === clientOrderId) ?? null;
}

function isTerminal(status: string): boolean {
  return ["filled", "expired", "rejected", "cancelled"].includes(status);
}

export async function runScenario(
  scenario: Scenario,
  deps: OrchestratorDeps
): Promise<ScenarioRun> {
  const run = await createRun(scenario.id, scenario.userId);
  const triggeredAt = Date.now();
  const clientOrderId = `scenario-${run.id}`;

  try {
    await reseed(deps, scenario.spec.seed);
  } catch (err) {
    logger.warn("scenario reseed failed", { ...LOG, runId: run.id, err: err as Error });
    return (
      (await completeRun(run.id, {
        parentOrderId: null,
        actual: null,
        diff: null,
        status: "failed",
        error: `reseed failed: ${(err as Error).message}`,
      })) ?? run
    );
  }

  try {
    await deps.producer.send("orders.new", {
      clientOrderId,
      asset: scenario.spec.symbol,
      side: scenario.spec.side,
      quantity: scenario.spec.quantity,
      limitPrice: scenario.spec.limitPrice,
      strategy: scenario.spec.strategy,
      algoParams: scenario.spec.algoParams ?? { strategy: scenario.spec.strategy },
      expiresAt: Math.ceil((scenario.spec.durationMs ?? 60_000) / 1000),
      userId: scenario.userId,
      userRole: "trader",
      _scenarioId: scenario.id,
      _scenarioRunId: run.id,
    });
  } catch (err) {
    return (
      (await completeRun(run.id, {
        parentOrderId: null,
        actual: null,
        diff: null,
        status: "failed",
        error: `submit failed: ${(err as Error).message}`,
      })) ?? run
    );
  }

  const deadline = Date.now() + FILL_TIMEOUT_MS;
  let order: JournalOrder | null = null;
  while (Date.now() < deadline) {
    order = await pollOrder(deps, clientOrderId, scenario.userId);
    if (order && isTerminal(order.status)) break;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!order) {
    return (
      (await completeRun(run.id, {
        parentOrderId: null,
        actual: null,
        diff: null,
        status: "failed",
        error: "Order never reached the journal within timeout",
      })) ?? run
    );
  }

  const completedAt = Date.now();
  const actual = computeActual(order, triggeredAt, completedAt);
  const diff = diffOutcome(scenario.expected, actual);
  const expectedSpecified =
    scenario.expected !== null &&
    Object.keys(scenario.expected ?? {}).some((k) => k !== "tolerance");
  const status = !expectedSpecified ? "completed" : diff.matched ? "completed" : "mismatched";

  return (
    (await completeRun(run.id, {
      parentOrderId: order.id,
      actual,
      diff,
      status,
      error: null,
    })) ?? run
  );
}
