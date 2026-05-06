import { CORS_HEADERS } from "@veta/http";
import { logger } from "@veta/logger";
import { runScenario } from "../../scenarios/orchestrator.ts";
import { ScenarioCreateSchema, ScenarioUpdateSchema } from "../../scenarios/schema.ts";
import {
  createScenario,
  deleteScenario,
  getScenario,
  listRuns,
  listScenarios,
  updateScenario,
} from "../../scenarios/store.ts";
import { type GatewayContext, isResponse } from "../context.ts";

const LOG = { component: "gateway-scenarios" };

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

function requireTrader(role: string): Response | null {
  if (role === "trader" || role === "admin") return null;
  return json(403, { error: "Trader or admin role required" });
}

const SCENARIO_ID_RE = /^\/scenarios\/([a-z0-9-]+)$/;
const SCENARIO_RUN_RE = /^\/scenarios\/([a-z0-9-]+)\/run$/;
const SCENARIO_RUNS_RE = /^\/scenarios\/([a-z0-9-]+)\/runs$/;

export async function handleScenariosRoute(
  req: Request,
  path: string,
  ctx: GatewayContext,
): Promise<Response | null> {
  if (!path.startsWith("/scenarios")) return null;

  const auth = await ctx.requireAuth(req);
  if (isResponse(auth)) return auth;

  if (path === "/scenarios" && req.method === "GET") {
    const list = await listScenarios(auth.user.id);
    return json(200, { scenarios: list });
  }

  if (path === "/scenarios" && req.method === "POST") {
    const denied = requireTrader(auth.user.role);
    if (denied) return denied;
    let parsed;
    try {
      parsed = ScenarioCreateSchema.parse(await req.json());
    } catch (err) {
      return json(400, { error: "Invalid scenario", detail: (err as Error).message });
    }
    try {
      const created = await createScenario({
        userId: auth.user.id,
        name: parsed.name,
        description: parsed.description,
        spec: parsed.spec,
        expected: parsed.expected,
      });
      return json(201, { scenario: created });
    } catch (err) {
      if ((err as Error).message.includes("scenarios_user_id_name_key")) {
        return json(409, { error: "A scenario with that name already exists" });
      }
      throw err;
    }
  }

  const idMatch = path.match(SCENARIO_ID_RE);
  if (idMatch) {
    const id = idMatch[1];
    if (req.method === "GET") {
      const scenario = await getScenario(auth.user.id, id);
      if (!scenario) return json(404, { error: "Not found" });
      return json(200, { scenario });
    }
    if (req.method === "PUT") {
      const denied = requireTrader(auth.user.role);
      if (denied) return denied;
      let parsed;
      try {
        parsed = ScenarioUpdateSchema.parse(await req.json());
      } catch (err) {
        return json(400, { error: "Invalid scenario", detail: (err as Error).message });
      }
      const updated = await updateScenario(auth.user.id, id, parsed);
      if (!updated) return json(404, { error: "Not found" });
      return json(200, { scenario: updated });
    }
    if (req.method === "DELETE") {
      const denied = requireTrader(auth.user.role);
      if (denied) return denied;
      const ok = await deleteScenario(auth.user.id, id);
      return ok ? json(204, {}) : json(404, { error: "Not found" });
    }
    return json(405, { error: "Method not allowed" });
  }

  const runMatch = path.match(SCENARIO_RUN_RE);
  if (runMatch && req.method === "POST") {
    const denied = requireTrader(auth.user.role);
    if (denied) return denied;
    const id = runMatch[1];
    const scenario = await getScenario(auth.user.id, id);
    if (!scenario) return json(404, { error: "Not found" });

    try {
      const run = await runScenario(scenario, {
        producer: ctx.producer,
        marketSimUrl: ctx.urls.marketSim,
        journalUrl: ctx.urls.journal,
      });
      return json(200, { run });
    } catch (err) {
      logger.error("scenario run failed", { ...LOG, scenarioId: id, err: err as Error });
      return json(500, { error: "Run failed", detail: (err as Error).message });
    }
  }

  const runsMatch = path.match(SCENARIO_RUNS_RE);
  if (runsMatch && req.method === "GET") {
    const id = runsMatch[1];
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? "20");
    const runs = await listRuns(auth.user.id, id, limit);
    return json(200, { runs });
  }

  return null;
}
