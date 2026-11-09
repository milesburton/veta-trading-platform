import { ALGO_REGISTRY } from "#veta/algo-registry";
import type { Pool } from "../lib/db.ts";

export interface ScenarioEvidence {
  algoId: string;
  status: string;
  triggeredAt: number;
  algoVersion: string | null;
  commitSha: string | null;
}

export interface RiskConfigVersion {
  id: number;
  createdAt: string;
  createdBy: string;
}

export interface KillSwitchEvent {
  action: string;
  actorId: string;
  target: string | null;
  ts: number;
}

export interface AlgoControlsInputs {
  riskEngineEnabled: boolean;
  riskConfig: RiskConfigVersion | null;
  scenarioEvidence: readonly ScenarioEvidence[];
  killSwitchEvents: readonly KillSwitchEvent[];
}

export interface AlgoControlsReport {
  riskEngineEnabled: boolean;
  riskConfig: RiskConfigVersion | null;
  algorithms: Array<{
    algoId: string;
    version: string;
    description: string;
    lastScenarioRun: ScenarioEvidence | null;
  }>;
  killSwitchHistory: KillSwitchEvent[];
}

export function buildAlgoControls(inputs: AlgoControlsInputs): AlgoControlsReport {
  const latest = new Map<string, ScenarioEvidence>();
  for (const run of inputs.scenarioEvidence) {
    const existing = latest.get(run.algoId);
    if (!existing || run.triggeredAt > existing.triggeredAt) latest.set(run.algoId, run);
  }
  const algorithms = Object.values(ALGO_REGISTRY)
    .map((entry) => ({
      algoId: entry.algoId,
      version: entry.version,
      description: entry.description,
      lastScenarioRun: latest.get(entry.algoId) ?? null,
    }))
    .sort((a, b) => a.algoId.localeCompare(b.algoId));
  return {
    riskEngineEnabled: inputs.riskEngineEnabled,
    riskConfig: inputs.riskConfig,
    algorithms,
    killSwitchHistory: inputs.killSwitchEvents
      .filter((e) => e.action === "orders_kill" || e.action === "orders_resume")
      .toSorted((a, b) => b.ts - a.ts),
  };
}

export async function loadScenarioEvidence(pool: Pool): Promise<ScenarioEvidence[]> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<{
      algo_id: string;
      status: string;
      triggered_at: Date;
      algo_version: string | null;
      commit_sha: string | null;
    }>(
      `SELECT DISTINCT ON (algo_id) algo_id, status, triggered_at, algo_version, commit_sha
         FROM scenarios.runs
        WHERE algo_id IS NOT NULL
        ORDER BY algo_id, triggered_at DESC`
    );
    return rows.map((r) => ({
      algoId: r.algo_id,
      status: r.status,
      triggeredAt: r.triggered_at.getTime(),
      algoVersion: r.algo_version,
      commitSha: r.commit_sha,
    }));
  } finally {
    client.release();
  }
}

export async function loadRiskConfigVersion(pool: Pool): Promise<RiskConfigVersion | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.queryObject<{ id: bigint; created_at: Date; created_by: string }>(
      "SELECT id, created_at, created_by FROM risk.config_versions ORDER BY id DESC LIMIT 1"
    );
    const row = rows[0];
    return row
      ? { id: Number(row.id), createdAt: row.created_at.toISOString(), createdBy: row.created_by }
      : null;
  } finally {
    client.release();
  }
}
