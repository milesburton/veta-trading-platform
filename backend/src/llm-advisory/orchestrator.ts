import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { FeatureVector, Signal, TradeRecommendation } from "../types/intelligence.ts";
import type { LlmJob } from "../types/llm-advisory.ts";
import { JobStore } from "./job-store.ts";
import { loadPolicy, isPolicyEnabled } from "./policy.ts";
import { shouldEnqueueJob } from "./dedupe.ts";
import {
  evaluateSignalTrigger,
  evaluateRecommendationTrigger,
  evaluateScenarioTrigger,
  evaluateUiRequestTrigger,
  evaluateStalenessRefreshTrigger,
  type TriggerCandidate,
} from "./trigger-rules.ts";

const PORT = Number(Deno.env.get("LLM_ADVISORY_PORT")) || 5_024;
const DB_PATH = Deno.env.get("LLM_ADVISORY_DB_PATH") || "./backend/data/llm-advisory.db";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const policy = loadPolicy();
const store = new JobStore(DB_PATH);

store.sweepStuckJobs(10 * 60 * 1000);

const latestSignals = new Map<string, Signal>();
const latestFeatures = new Map<string, FeatureVector>();
const latestRecs = new Map<string, TradeRecommendation>();
const prevRecs = new Map<string, TradeRecommendation>();

const producer = await createProducer("llm-advisory-orchestrator").catch((err) => {
  console.warn("[llm-advisory] Redpanda unavailable for publishing:", err.message);
  return null;
});

function enqueueIfAllowed(candidate: TriggerCandidate): string | null {
  if (!isPolicyEnabled(policy)) return null;
  const allowed = shouldEnqueueJob(store, candidate.contextHash, policy);
  if (!allowed) return null;

  const jobId = store.insertJob({
    symbol: candidate.symbol,
    triggerReason: candidate.triggerReason,
    status: "queued",
    contextHash: candidate.contextHash,
    priority: candidate.priority,
    requestedBy: candidate.requestedBy,
    createdAt: Date.now(),
    claimedAt: null,
    completedAt: null,
    workerSessionId: null,
    errorMessage: null,
    retryCount: 0,
  });

  producer?.send("llm.job.queued", {
    jobId,
    symbol: candidate.symbol,
    triggerReason: candidate.triggerReason,
    priority: candidate.priority,
    ts: Date.now(),
  }).catch(() => {});

  return jobId;
}

createConsumer("orchestrator-signals", ["market.signals"]).then((c) => {
  c.onMessage(async (_topic, raw) => {
    const signal = raw as Signal;
    if (!signal.symbol) return;
    latestSignals.set(signal.symbol, signal);
    const candidate = await evaluateSignalTrigger(policy, signal);
    if (candidate) enqueueIfAllowed(candidate);
  });
}).catch(() => {});

createConsumer("orchestrator-recommendations", ["market.recommendations"]).then((c) => {
  c.onMessage(async (_topic, raw) => {
    const rec = raw as TradeRecommendation;
    if (!rec.symbol) return;
    const prev = latestRecs.get(rec.symbol);
    prevRecs.set(rec.symbol, prev ?? rec);
    latestRecs.set(rec.symbol, rec);
    const candidate = await evaluateRecommendationTrigger(policy, rec, prev);
    if (candidate) enqueueIfAllowed(candidate);
  });
}).catch(() => {});

createConsumer("orchestrator-features", ["market.features"]).then((c) => {
  c.onMessage((_topic, raw) => {
    const fv = raw as FeatureVector;
    if (fv.symbol) latestFeatures.set(fv.symbol, fv);
  });
}).catch(() => {});

setInterval(async () => {
  if (!isPolicyEnabled(policy)) return;
  for (const [symbol] of latestSignals) {
    const hasPending = store.getJobsBySymbol(symbol, 5).some(
      (j) => j.status === "queued" || j.status === "running",
    );
    if (hasPending) continue;
    const latest = store.getLatestNote(symbol);
    const candidate = await evaluateStalenessRefreshTrigger(
      policy,
      symbol,
      latest?.createdAt ?? null,
    );
    if (candidate) enqueueIfAllowed(candidate);
  }
}, 60_000);

setInterval(() => {
  store.pruneOldData(7 * 24 * 60 * 60 * 1000);
}, 24 * 60 * 60 * 1000);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === "/health" && req.method === "GET") {
    return json({
      service: "llm-advisory-orchestrator",
      version: VERSION,
      status: "ok",
      policyEnabled: policy.enabled,
      pendingJobs: store.getPendingJobCount(),
      trackedSymbols: latestSignals.size,
    });
  }

  const advisoryMatch = path.match(/^\/advisory\/([^/]+)$/);
  if (advisoryMatch && req.method === "GET") {
    const symbol = decodeURIComponent(advisoryMatch[1]);
    const note = store.getLatestNote(symbol);
    if (!note) return json({ status: "no-advisory", symbol });
    const pendingJob = store.getJobsBySymbol(symbol, 5).find(
      (j) => j.status === "queued" || j.status === "running",
    );
    return json({ ...note, hasPendingJob: !!pendingJob });
  }

  if (path === "/advisory/request" && req.method === "POST") {
    if (!isPolicyEnabled(policy)) {
      return json({ error: "LLM advisory is not enabled on this deployment" }, 503);
    }
    const body = await req.json() as { symbol?: string; requestedBy?: string };
    if (!body.symbol) return json({ error: "symbol is required" }, 400);
    const candidate = await evaluateUiRequestTrigger(
      policy,
      body.symbol,
      body.requestedBy ?? "unknown",
    );
    if (!candidate) return json({ error: "Could not create trigger candidate" }, 422);
    const jobId = enqueueIfAllowed(candidate);
    if (!jobId) {
      const existingJob = store.getJobsBySymbol(body.symbol, 5).find(
        (j) => j.status === "queued" || j.status === "running",
      );
      return json({
        status: "deduplicated",
        message: "A recent job already exists for this symbol",
        existingJobId: existingJob?.id ?? null,
      });
    }
    return json({ status: "queued", jobId }, 202);
  }

  if (path === "/advisory/scenario-context" && req.method === "POST") {
    if (!isPolicyEnabled(policy)) return json({ status: "disabled" }, 200);
    const body = await req.json() as { symbol?: string; shocks?: Array<{ factor: string }> };
    if (!body.symbol) return json({ error: "symbol is required" }, 400);
    const shockFactors = (body.shocks ?? []).map((s) => s.factor);
    const candidate = await evaluateScenarioTrigger(policy, body.symbol, shockFactors);
    if (!candidate) return json({ status: "skipped" }, 200);
    const jobId = enqueueIfAllowed(candidate);
    return json({ status: jobId ? "queued" : "deduplicated", jobId }, jobId ? 202 : 200);
  }

  if (path === "/jobs" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    if (symbol) {
      return json(store.getJobsBySymbol(symbol, 50));
    }
    const jobs: LlmJob[] = [];
    for (const [sym] of latestSignals) {
      const symJobs = store.getJobsBySymbol(sym, 10);
      jobs.push(...symJobs);
      if (jobs.length >= 50) break;
    }
    return json(jobs.slice(0, 50));
  }

  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "GET") {
    const job = store.getJob(jobMatch[1]);
    if (!job) return json({ error: "Job not found" }, 404);
    return json(job);
  }

  const jobCancelMatch = path.match(/^\/jobs\/([^/]+)\/cancel$/);
  if (jobCancelMatch && req.method === "PUT") {
    const job = store.getJob(jobCancelMatch[1]);
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.status !== "queued") return json({ error: "Only queued jobs may be cancelled" }, 409);
    store.updateJobStatus(job.id, "cancelled");
    return json({ status: "cancelled", jobId: job.id });
  }

  if (path === "/admin/trigger-worker" && req.method === "POST") {
    try {
      const supervisorConf = Deno.env.get("SUPERVISORD_CONF") || "/home/deno/supervisord.conf";
      const cmd = new Deno.Command("supervisorctl", {
        args: ["-c", supervisorConf, "start", "llm-worker"],
        stdout: "piped",
        stderr: "piped",
      });
      const result = await cmd.output();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      const stderr = new TextDecoder().decode(result.stderr).trim();
      if (result.code === 0) {
        return json({ status: "started", output: stdout });
      }
      return json({ status: "error", output: stdout || stderr }, 500);
    } catch (err) {
      return json({ status: "error", message: (err as Error).message }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
});
