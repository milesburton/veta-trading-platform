import "#veta/bootstrap";
import { json, serveJsonService } from "#veta/http";
import { logger } from "#veta/logger";
import type { FeatureVector, ScenarioShock, Signal } from "#veta/types/intelligence";
import { armIdleExit } from "../shared/idle-exit.ts";
import { scoreFeatureVector } from "../signal-engine/scorer.ts";
import { DEFAULT_WEIGHTS } from "../signal-engine/weight-store.ts";
import { applyShocks } from "./apply-shocks.ts";

const PORT = Number(process.env.SCENARIO_ENGINE_PORT) || 5_020;
const FEATURE_ENGINE_URL = process.env.FEATURE_ENGINE_URL || "http://localhost:5017";
const SIGNAL_ENGINE_URL = process.env.SIGNAL_ENGINE_URL || "http://localhost:5018";
const VERSION = process.env.COMMIT_SHA || "dev";

interface ScenarioRequest {
  symbol: string;
  shocks: ScenarioShock[];
}

interface ScenarioResult {
  symbol: string;
  baseline: Signal;
  shocked: Signal;
  delta: number;
  shocksApplied: ScenarioShock[];
}

const IDLE_TIMEOUT_MS = Number(process.env.SCENARIO_ENGINE_IDLE_TIMEOUT_SECONDS ?? "600") * 1_000;
const idleExit = armIdleExit(IDLE_TIMEOUT_MS);

serveJsonService({
  port: PORT,
  service: "scenario-engine",
  version: VERSION,
  health: () => ({}),
  onRequest: () => idleExit.touch(),
  // fallow-ignore-next-line complexity
  handler: async (req, url, path) => {
    if (path === "/scenario" && req.method === "POST") {
      let body: ScenarioRequest;
      try {
        body = (await req.json()) as ScenarioRequest;
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const { symbol, shocks } = body;
      if (!symbol || !Array.isArray(shocks)) {
        return json({ error: "symbol and shocks[] are required" }, 400);
      }

      let fv: FeatureVector | null = null;
      try {
        const res = await fetch(`${FEATURE_ENGINE_URL}/features/${encodeURIComponent(symbol)}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) fv = (await res.json()) as FeatureVector;
      } catch {
        /* ignored */
      }

      if (!fv) {
        return json({ error: `No feature data available for ${symbol}` }, 503);
      }

      let weights = { ...DEFAULT_WEIGHTS };
      try {
        const res = await fetch(`${SIGNAL_ENGINE_URL}/weights`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) weights = (await res.json()) as typeof weights;
      } catch {
        /* use defaults */
      }

      const baseline = scoreFeatureVector(fv, weights);

      const shockedFv = applyShocks(fv, shocks);
      const shocked = scoreFeatureVector(shockedFv, weights);
      const delta = shocked.score - baseline.score;

      const result: ScenarioResult = {
        symbol,
        baseline,
        shocked,
        delta,
        shocksApplied: shocks,
      };

      return json(result);
    }

    return json({ error: "Not Found" }, 404);
  },
});

logger.info(`Running on port ${PORT}`);
