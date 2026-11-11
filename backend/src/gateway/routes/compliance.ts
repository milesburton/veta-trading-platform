import { CORS_HEADERS } from "#veta/http";
import { logger } from "#veta/logger";
import { riskPool, scenariosPool } from "../../lib/db.ts";
import {
  buildAlgoControls,
  type KillSwitchEvent,
  loadRiskConfigVersion,
  loadScenarioEvidence,
} from "../algo-controls.ts";
import { type GatewayContext, isResponse } from "../context.ts";

const COMPLIANCE_READERS = new Set(["admin", "compliance"]);

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

const KILL_SWITCH_ACTIONS = ["orders_kill", "orders_resume"] as const;

async function fetchRiskEngineEnabled(ctx: GatewayContext): Promise<boolean | null> {
  try {
    const res = await fetch(`${ctx.urls.omsUrl}/health`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { riskEngineEnabled?: unknown };
    return typeof body.riskEngineEnabled === "boolean" ? body.riskEngineEnabled : null;
  } catch {
    return null;
  }
}

async function fetchKillSwitchEvents(ctx: GatewayContext): Promise<KillSwitchEvent[]> {
  const query = new URLSearchParams({ action: KILL_SWITCH_ACTIONS.join(","), limit: "500" });
  const res = await fetch(`${ctx.urls.journal}/audit?${query}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`audit returned ${res.status}`);
  const events = (await res.json()) as Array<{
    action: string;
    actorId: string;
    target: string | null;
    ts: number;
  }>;
  return events.map((e) => ({ action: e.action, actorId: e.actorId, target: e.target, ts: e.ts }));
}

export async function handleComplianceRoute(
  req: Request,
  path: string,
  ctx: GatewayContext
): Promise<Response | null> {
  if (path !== "/compliance/algo-controls" || req.method !== "GET") return null;

  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;
  if (!COMPLIANCE_READERS.has(auth.user.role)) {
    return json(403, { error: "Admin or compliance role required" });
  }

  try {
    const [scenarioEvidence, riskConfig, killSwitchEvents, riskEngineEnabled] = await Promise.all([
      loadScenarioEvidence(scenariosPool),
      loadRiskConfigVersion(riskPool),
      fetchKillSwitchEvents(ctx),
      fetchRiskEngineEnabled(ctx),
    ]);
    return json(
      200,
      buildAlgoControls({
        riskEngineEnabled,
        riskConfig,
        scenarioEvidence,
        killSwitchEvents,
      })
    );
  } catch (err) {
    logger.warn("algo-controls report failed", { component: "gateway-compliance", err });
    return json(502, { error: "Could not assemble the algo controls report" });
  }
}
