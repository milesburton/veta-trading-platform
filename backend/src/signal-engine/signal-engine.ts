import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { FeatureVector, Signal } from "../types/intelligence.ts";
import { createWeightStore } from "./weight-store.ts";
import { scoreFeatureVector } from "./scorer.ts";
import { runReplay } from "./replay-server.ts";
import { intelligencePool } from "../lib/db.ts";

const PORT = Number(Deno.env.get("SIGNAL_ENGINE_PORT")) || 5_018;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const weightStore = await createWeightStore(intelligencePool);
const latestSignals = new Map<string, Signal>();

const producer = await createProducer("signal-engine").catch((err) => {
  console.warn("[signal-engine] Redpanda unavailable:", err.message);
  return null;
});

const consumer = await createConsumer("signal-engine", ["market.features"])
  .catch((err) => {
    console.warn(
      "[signal-engine] Cannot subscribe to market.features:",
      err.message,
    );
    return null;
  });

if (consumer) {
  consumer.onMessage(async (_topic, raw) => {
    const fv = raw as FeatureVector;
    if (!fv.symbol) return;

    const weights = await weightStore.getWeights();
    const signal = scoreFeatureVector(fv, weights);

    latestSignals.set(signal.symbol, signal);

    if (producer) {
      await producer.send("market.signals", signal).catch(() => {});
    }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "signal-engine",
      version: VERSION,
      status: "ok",
      trackedSymbols: latestSignals.size,
    });
  }

  if (path === "/weights" && req.method === "GET") {
    return json(await weightStore.getWeights());
  }

  if (path === "/weights" && req.method === "PUT") {
    try {
      const body = await req.json() as Record<string, number>;
      const current = await weightStore.getWeights();
      const updated = { ...current };
      for (const [k, v] of Object.entries(body)) {
        if (k in current && typeof v === "number" && isFinite(v)) {
          (updated as Record<string, number>)[k] = v;
        }
      }
      await weightStore.saveWeights(updated);
      console.log("[signal-engine] Weights updated:", updated);
      return json(updated);
    } catch {
      return json({ error: "Invalid body" }, 400);
    }
  }

  const sigMatch = path.match(/^\/signals\/([^/]+)$/);
  if (sigMatch && req.method === "GET") {
    const symbol = decodeURIComponent(sigMatch[1]);
    const signal = latestSignals.get(symbol);
    if (!signal) return json({ error: "No signal data for symbol" }, 404);
    return json(signal);
  }

  if (path === "/signals" && req.method === "GET") {
    return json(Object.fromEntries(latestSignals));
  }

  if (path === "/replay" && req.method === "POST") {
    let body: { symbol: string; from: number; to: number };
    try {
      body = await req.json() as typeof body;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { symbol, from, to } = body;
    if (!symbol || !from || !to) {
      return json({ error: "symbol, from, and to are required" }, 400);
    }
    if (to - from > 7 * 24 * 60 * 60 * 1000) {
      return json({ error: "Replay range must not exceed 7 days" }, 400);
    }
    try {
      const frames = await runReplay(symbol, from, to, weightStore);
      return json(frames);
    } catch (err) {
      return json({ error: (err as Error).message }, 503);
    }
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

console.log(`[signal-engine] Running on port ${PORT}`);
