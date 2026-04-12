import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type {
  FeatureVector,
  ScenarioShock,
  Signal,
} from "../types/intelligence.ts";
import { scoreFeatureVector } from "../signal-engine/scorer.ts";
import { DEFAULT_WEIGHTS } from "../signal-engine/weight-store.ts";
import { json, corsOptions } from "../lib/http.ts";

const PORT = Number(Deno.env.get("SCENARIO_ENGINE_PORT")) || 5_020;
const FEATURE_ENGINE_URL = Deno.env.get("FEATURE_ENGINE_URL") ||
  "http://localhost:5017";
const SIGNAL_ENGINE_URL = Deno.env.get("SIGNAL_ENGINE_URL") ||
  "http://localhost:5018";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

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

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return corsOptions();
  }

  if (path === "/health" && req.method === "GET") {
    return json({ service: "scenario-engine", version: VERSION, status: "ok" });
  }

  if (path === "/scenario" && req.method === "POST") {
    let body: ScenarioRequest;
    try {
      body = await req.json() as ScenarioRequest;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { symbol, shocks } = body;
    if (!symbol || !Array.isArray(shocks)) {
      return json({ error: "symbol and shocks[] are required" }, 400);
    }

    let fv: FeatureVector | null = null;
    try {
      const res = await fetch(
        `${FEATURE_ENGINE_URL}/features/${encodeURIComponent(symbol)}`,
        {
          signal: AbortSignal.timeout(3_000),
        },
      );
      if (res.ok) fv = await res.json() as FeatureVector;
    } catch { /* ignored */ }

    if (!fv) {
      return json({ error: `No feature data available for ${symbol}` }, 503);
    }

    let weights = { ...DEFAULT_WEIGHTS };
    try {
      const res = await fetch(`${SIGNAL_ENGINE_URL}/weights`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) weights = await res.json() as typeof weights;
    } catch { /* use defaults */ }

    const baseline = scoreFeatureVector(fv, weights);

    const shockedFv: FeatureVector = { ...fv };
    for (const shock of shocks) {
      if (shock.factor in shockedFv) {
        (shockedFv as unknown as Record<string, number>)[shock.factor] =
          (shockedFv as unknown as Record<string, number>)[shock.factor] +
          shock.delta;
      }
    }

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
});

console.log(`[scenario-engine] Running on port ${PORT}`);
