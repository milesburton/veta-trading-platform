import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { FeatureVector, Signal, TradeRecommendation } from "../types/intelligence.ts";
import type { LlmJob, LlmSubsystemStatus } from "../types/llm-advisory.ts";
import { JobStore } from "./job-store.ts";
import { loadPolicy, isPolicyEnabled, canAutoTrigger, canTriggerFromUi, isWithinAllowedHours } from "./policy.ts";
import { RuntimeConfigStore, resolveEffectivePolicy, deriveSubsystemState } from "./runtime-config-store.ts";
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
const RUNTIME_DB_PATH = DB_PATH.replace(/\.db$/, "-runtime.db");
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const basePolicy = loadPolicy();
const store = new JobStore(DB_PATH);
const runtimeConfig = new RuntimeConfigStore(RUNTIME_DB_PATH);

store.sweepStuckJobs(10 * 60 * 1000);

const latestSignals = new Map<string, Signal>();
const latestFeatures = new Map<string, FeatureVector>();
const latestRecs = new Map<string, TradeRecommendation>();
const prevRecs = new Map<string, TradeRecommendation>();

let lastErrorMs: number | null = null;
let lastActivityMs: number | null = null;

const producer = await createProducer("llm-advisory-orchestrator").catch((err) => {
  console.warn("[llm-advisory] Redpanda unavailable for publishing:", err.message);
  return null;
});

function getEffectivePolicy() {
  return resolveEffectivePolicy(basePolicy, runtimeConfig.getConfig());
}

function broadcastStateUpdate() {
  const ep = getEffectivePolicy();
  const pending = store.getPendingJobCount();
  const status: LlmSubsystemStatus = {
    state: deriveSubsystemState(ep, pending, lastErrorMs, lastActivityMs),
    policy: ep,
    runtimeConfig: runtimeConfig.getConfig(),
    pendingJobs: pending,
    trackedSymbols: latestSignals.size,
    lastWorkerSession: null,
    ts: Date.now(),
  };
  producer?.send("llm.state.update", status).catch(() => {});
}

function enqueueIfAllowed(candidate: TriggerCandidate): string | null {
  const ep = getEffectivePolicy();
  if (!isPolicyEnabled(ep)) return null;
  if (!isWithinAllowedHours(ep)) return null;

  const allowed = shouldEnqueueJob(store, candidate.contextHash, ep);
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

  lastActivityMs = Date.now();

  producer?.send("llm.job.queued", {
    jobId,
    symbol: candidate.symbol,
    triggerReason: candidate.triggerReason,
    priority: candidate.priority,
    ts: Date.now(),
  }).catch(() => {});

  broadcastStateUpdate();
  return jobId;
}

createConsumer("orchestrator-signals", ["market.signals"]).then((c) => {
  c.onMessage(async (_topic, raw) => {
    const signal = raw as Signal;
    if (!signal.symbol) return;
    latestSignals.set(signal.symbol, signal);
    const ep = getEffectivePolicy();
    if (!canAutoTrigger(ep)) return;
    const candidate = await evaluateSignalTrigger(ep, signal);
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
    const ep = getEffectivePolicy();
    if (!canAutoTrigger(ep)) return;
    const candidate = await evaluateRecommendationTrigger(ep, rec, prev);
    if (candidate) enqueueIfAllowed(candidate);
  });
}).catch(() => {});

createConsumer("orchestrator-features", ["market.features"]).then((c) => {
  c.onMessage((_topic, raw) => {
    const fv = raw as FeatureVector;
    if (fv.symbol) latestFeatures.set(fv.symbol, fv);
  });
}).catch(() => {});

createConsumer("orchestrator-worker-status", ["llm.worker.status"]).then((c) => {
  c.onMessage((_topic, raw) => {
    const msg = raw as { event: string; symbol?: string; error?: string };
    if (msg.event === "error") lastErrorMs = Date.now();
    if (msg.event === "completed") lastActivityMs = Date.now();
    broadcastStateUpdate();
  });
}).catch(() => {});

setInterval(async () => {
  const ep = getEffectivePolicy();
  if (!canAutoTrigger(ep)) return;
  for (const [symbol] of latestSignals) {
    const hasPending = store.getJobsBySymbol(symbol, 5).some(
      (j) => j.status === "queued" || j.status === "running",
    );
    if (hasPending) continue;
    const latest = store.getLatestNote(symbol);
    const candidate = await evaluateStalenessRefreshTrigger(
      ep,
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
    const ep = getEffectivePolicy();
    const pending = store.getPendingJobCount();
    return json({
      service: "llm-advisory-orchestrator",
      version: VERSION,
      status: "ok",
      subsystemState: deriveSubsystemState(ep, pending, lastErrorMs, lastActivityMs),
      policyEnabled: ep.enabled,
      workerEnabled: ep.workerEnabled,
      triggerMode: ep.triggerMode,
      pendingJobs: pending,
      trackedSymbols: latestSignals.size,
    });
  }

  if (path === "/admin/state" && req.method === "GET") {
    const ep = getEffectivePolicy();
    const pending = store.getPendingJobCount();
    const status: LlmSubsystemStatus = {
      state: deriveSubsystemState(ep, pending, lastErrorMs, lastActivityMs),
      policy: ep,
      runtimeConfig: runtimeConfig.getConfig(),
      pendingJobs: pending,
      trackedSymbols: latestSignals.size,
      lastWorkerSession: null,
      ts: Date.now(),
    };
    return json(status);
  }

  if (path === "/admin/state" && req.method === "PUT") {
    const body = await req.json() as Partial<{
      enabled: boolean;
      workerEnabled: boolean;
      triggerMode: string;
      updatedBy: string;
    }>;
    const updatedBy = body.updatedBy ?? "api";
    const updated = runtimeConfig.updateConfig({
      enabled: body.enabled,
      workerEnabled: body.workerEnabled,
      triggerMode: body.triggerMode as ReturnType<typeof getEffectivePolicy>["triggerMode"] | undefined,
    }, updatedBy);
    broadcastStateUpdate();
    return json({ status: "updated", runtimeConfig: updated });
  }

  if (path === "/admin/watchlist-brief" && req.method === "POST") {
    const ep = getEffectivePolicy();
    if (!canTriggerFromUi(ep)) {
      return json({ error: "LLM advisory is not enabled or trigger mode prevents UI requests" }, 503);
    }
    const body = await req.json() as { symbols?: string[]; requestedBy?: string };
    const symbols = body.symbols ?? [...latestSignals.keys()].slice(0, 10);
    const requestedBy = body.requestedBy ?? "watchlist-brief";
    const jobIds: string[] = [];
    for (const symbol of symbols) {
      const candidate = await evaluateUiRequestTrigger(ep, symbol, requestedBy);
      if (candidate) {
        const jobId = enqueueIfAllowed(candidate);
        if (jobId) jobIds.push(jobId);
      }
    }
    return json({ status: "queued", jobIds, count: jobIds.length }, 202);
  }

  if (path === "/admin/trigger-worker" && req.method === "POST") {
    const ep = getEffectivePolicy();
    if (!ep.workerEnabled) {
      return json({ error: "LLM_WORKER_ENABLED is false — enable the worker before triggering" }, 503);
    }
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
    const ep = getEffectivePolicy();
    if (!canTriggerFromUi(ep)) {
      return json({ error: "LLM advisory is not enabled or trigger mode prevents UI requests" }, 503);
    }
    const body = await req.json() as { symbol?: string; requestedBy?: string };
    if (!body.symbol) return json({ error: "symbol is required" }, 400);
    const candidate = await evaluateUiRequestTrigger(ep, body.symbol, body.requestedBy ?? "unknown");
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
    const ep = getEffectivePolicy();
    if (!isPolicyEnabled(ep)) return json({ status: "disabled" }, 200);
    const body = await req.json() as { symbol?: string; shocks?: Array<{ factor: string }> };
    if (!body.symbol) return json({ error: "symbol is required" }, 400);
    const shockFactors = (body.shocks ?? []).map((s) => s.factor);
    const candidate = await evaluateScenarioTrigger(ep, body.symbol, shockFactors);
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

  return json({ error: "Not found" }, 404);
});
