import { scenariosPool } from "@veta/db";
import type {
  Scenario,
  ScenarioActual,
  ScenarioDiff,
  ScenarioExpected,
  ScenarioRun,
  ScenarioSpec,
  RunStatus,
} from "./types.ts";

interface ScenarioRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  spec: ScenarioSpec;
  expected: ScenarioExpected | null;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  scenario_id: string;
  user_id: string;
  triggered_at: string;
  completed_at: string | null;
  parent_order_id: string | null;
  actual: ScenarioActual | null;
  diff: ScenarioDiff | null;
  status: RunStatus;
  error: string | null;
}

function rowToScenario(r: ScenarioRow): Scenario {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    spec: r.spec,
    expected: r.expected,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToRun(r: RunRow): ScenarioRun {
  return {
    id: r.id,
    scenarioId: r.scenario_id,
    userId: r.user_id,
    triggeredAt: r.triggered_at,
    completedAt: r.completed_at,
    parentOrderId: r.parent_order_id,
    actual: r.actual,
    diff: r.diff,
    status: r.status,
    error: r.error,
  };
}

export interface CreateScenarioInput {
  userId: string;
  name: string;
  description?: string;
  spec: ScenarioSpec;
  expected?: ScenarioExpected;
}

export interface UpdateScenarioInput {
  name?: string;
  description?: string | null;
  spec?: ScenarioSpec;
  expected?: ScenarioExpected | null;
}

export async function createScenario(input: CreateScenarioInput): Promise<Scenario> {
  const id = `sc-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<ScenarioRow>(
      `INSERT INTO scenarios.scenarios (id, user_id, name, description, spec, expected)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, name, description, spec, expected, created_at, updated_at`,
      [
        id,
        input.userId,
        input.name,
        input.description ?? null,
        JSON.stringify(input.spec),
        input.expected ? JSON.stringify(input.expected) : null,
      ],
    );
    return rowToScenario(res.rows[0]);
  } finally {
    client.release();
  }
}

export async function listScenarios(userId: string): Promise<Scenario[]> {
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<ScenarioRow>(
      `SELECT id, user_id, name, description, spec, expected, created_at, updated_at
         FROM scenarios.scenarios
        WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [userId],
    );
    return res.rows.map(rowToScenario);
  } finally {
    client.release();
  }
}

export async function getScenario(userId: string, id: string): Promise<Scenario | null> {
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<ScenarioRow>(
      `SELECT id, user_id, name, description, spec, expected, created_at, updated_at
         FROM scenarios.scenarios
        WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return res.rows.length === 0 ? null : rowToScenario(res.rows[0]);
  } finally {
    client.release();
  }
}

export async function updateScenario(
  userId: string,
  id: string,
  input: UpdateScenarioInput,
): Promise<Scenario | null> {
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [userId, id];
  let i = 3;
  if (input.name !== undefined) {
    sets.push(`name = $${i++}`);
    params.push(input.name);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${i++}`);
    params.push(input.description);
  }
  if (input.spec !== undefined) {
    sets.push(`spec = $${i++}`);
    params.push(JSON.stringify(input.spec));
  }
  if (input.expected !== undefined) {
    sets.push(`expected = $${i++}`);
    params.push(input.expected === null ? null : JSON.stringify(input.expected));
  }
  if (sets.length === 1) return getScenario(userId, id);

  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<ScenarioRow>(
      `UPDATE scenarios.scenarios
          SET ${sets.join(", ")}
        WHERE user_id = $1 AND id = $2
        RETURNING id, user_id, name, description, spec, expected, created_at, updated_at`,
      params,
    );
    return res.rows.length === 0 ? null : rowToScenario(res.rows[0]);
  } finally {
    client.release();
  }
}

export async function deleteScenario(userId: string, id: string): Promise<boolean> {
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryArray(
      `DELETE FROM scenarios.scenarios WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    return (res.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function createRun(scenarioId: string, userId: string): Promise<ScenarioRun> {
  const id = `run-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<RunRow>(
      `INSERT INTO scenarios.runs (id, scenario_id, user_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, scenario_id, user_id, triggered_at, completed_at, parent_order_id, actual, diff, status, error`,
      [id, scenarioId, userId],
    );
    return rowToRun(res.rows[0]);
  } finally {
    client.release();
  }
}

export interface CompleteRunInput {
  parentOrderId: string | null;
  actual: ScenarioActual | null;
  diff: ScenarioDiff | null;
  status: RunStatus;
  error?: string | null;
}

export async function completeRun(
  runId: string,
  input: CompleteRunInput,
): Promise<ScenarioRun | null> {
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<RunRow>(
      `UPDATE scenarios.runs
          SET completed_at    = now(),
              parent_order_id = $2,
              actual          = $3,
              diff            = $4,
              status          = $5,
              error           = $6
        WHERE id = $1
        RETURNING id, scenario_id, user_id, triggered_at, completed_at, parent_order_id, actual, diff, status, error`,
      [
        runId,
        input.parentOrderId,
        input.actual ? JSON.stringify(input.actual) : null,
        input.diff ? JSON.stringify(input.diff) : null,
        input.status,
        input.error ?? null,
      ],
    );
    return res.rows.length === 0 ? null : rowToRun(res.rows[0]);
  } finally {
    client.release();
  }
}

export async function listRuns(
  userId: string,
  scenarioId: string,
  limit = 20,
): Promise<ScenarioRun[]> {
  const client = await scenariosPool.connect();
  try {
    const res = await client.queryObject<RunRow>(
      `SELECT id, scenario_id, user_id, triggered_at, completed_at, parent_order_id, actual, diff, status, error
         FROM scenarios.runs
        WHERE user_id = $1 AND scenario_id = $2
        ORDER BY triggered_at DESC
        LIMIT $3`,
      [userId, scenarioId, Math.min(Math.max(limit, 1), 100)],
    );
    return res.rows.map(rowToRun);
  } finally {
    client.release();
  }
}
