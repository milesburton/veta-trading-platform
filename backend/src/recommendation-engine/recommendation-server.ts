import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { Signal, TradeRecommendation } from "../types/intelligence.ts";
import { json, corsOptions } from "../lib/http.ts";

const PORT = Number(Deno.env.get("RECOMMENDATION_ENGINE_PORT")) || 5_019;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const CONFIDENCE_THRESHOLD = 0.6;

const recommendations: TradeRecommendation[] = [];
const MAX_RECOMMENDATIONS = 500;

function storeRec(rec: TradeRecommendation): void {
  recommendations.unshift(rec);
  if (recommendations.length > MAX_RECOMMENDATIONS) {
    recommendations.length = MAX_RECOMMENDATIONS;
  }
}

function signalToRecommendation(signal: Signal): TradeRecommendation | null {
  if (signal.confidence < CONFIDENCE_THRESHOLD) return null;

  const action = signal.direction === "long"
    ? "buy"
    : signal.direction === "short"
    ? "sell"
    : "hold";

  const suggestedQty = Math.max(
    10,
    Math.round(signal.confidence * 100 / 10) * 10,
  );

  const topFactors = [...signal.factors]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 2);

  const rationale = topFactors
    .map((f) => {
      const direction = f.contribution > 0 ? "positive" : "negative";
      const name = f.name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
      return `${direction} ${name} (${(f.contribution * 100).toFixed(1)}%)`;
    })
    .join("; ");

  return {
    symbol: signal.symbol,
    action,
    suggestedQty,
    rationale: `Signal score ${signal.score.toFixed(3)}: ${rationale}`,
    signalScore: signal.score,
    confidence: signal.confidence,
    ts: signal.ts,
  };
}

const producer = await createProducer("recommendation-engine").catch((err) => {
  console.warn("[recommendation-engine] Redpanda unavailable:", err.message);
  return null;
});

const consumer = await createConsumer("recommendation-engine", [
  "market.signals",
]).catch((err) => {
  console.warn(
    "[recommendation-engine] Cannot subscribe to market.signals:",
    err.message,
  );
  return null;
});

if (consumer) {
  consumer.onMessage(async (_topic, raw) => {
    const signal = raw as Signal;
    if (!signal.symbol) return;

    const rec = signalToRecommendation(signal);
    if (!rec) return;

    storeRec(rec);
    if (producer) {
      await producer.send("market.recommendations", rec).catch(() => {});
    }
  });
}

Deno.serve({ port: PORT }, (req: Request): Response => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return corsOptions();
  }

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "recommendation-engine",
      version: VERSION,
      status: "ok",
      count: recommendations.length,
    });
  }

  if (path === "/recommendations" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 200);
    const filtered = symbol
      ? recommendations.filter((r) => r.symbol === symbol)
      : recommendations;
    return json(filtered.slice(0, limit));
  }

  return json({ error: "Not Found" }, 404);
});

console.log(`[recommendation-engine] Running on port ${PORT}`);
