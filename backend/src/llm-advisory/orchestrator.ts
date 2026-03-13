import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";
import type { FeatureVector, Signal, TradeRecommendation } from "../types/intelligence.ts";
import type { LlmJob, LlmSubsystemStatus } from "../types/llm-advisory.ts";
import { createJobStore } from "./job-store.ts";
import { loadPolicy, isPolicyEnabled, canAutoTrigger, canTriggerFromUi, isWithinAllowedHours } from "./policy.ts";
import { createRuntimeConfigStore, resolveEffectivePolicy, deriveSubsystemState } from "./runtime-config-store.ts";
import { shouldEnqueueJob } from "./dedupe.ts";
import {
  evaluateSignalTrigger,
  evaluateRecommendationTrigger,
  evaluateScenarioTrigger,
  evaluateUiRequestTrigger,
  evaluateStalenessRefreshTrigger,
  type TriggerCandidate,
} from "./trigger-rules.ts";
import { llmAdvisoryPool } from "../lib/db.ts";

const PORT = Number(Deno.env.get("LLM_ADVISORY_PORT")) || 5_024;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const basePolicy = loadPolicy();
const store = createJobStore(llmAdvisoryPool);
const runtimeConfig = await createRuntimeConfigStore(llmAdvisoryPool);

await store.sweepStuckJobs(10 * 60 * 1000);

const latestSignals = new Map<string, Signal>();
const latestFeatures = new Map<string, FeatureVector>();
const latestRecs = new Map<string, TradeRecommendation>();
const prevRecs = new Map<string, TradeRecommendation>();

let lastErrorMs: number | null = null;
let lastActivityMs: number | null = null;

const producer = await Promise.race([
  createProducer("llm-advisory-orchestrator"),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
]).catch((err) => {
  console.warn("[llm-advisory] Redpanda unavailable for publishing:", err.message);
  return null;
});

async function getEffectivePolicy() {
  return resolveEffectivePolicy(basePolicy, await runtimeConfig.getConfig());
}

async function broadcastStateUpdate() {
  const [ep, pending, cfg] = await Promise.all([
    getEffectivePolicy(),
    store.getPendingJobCount(),
    runtimeConfig.getConfig(),
  ]);
  const status: LlmSubsystemStatus = {
    state: deriveSubsystemState(ep, pending, lastErrorMs, lastActivityMs),
    policy: ep,
    runtimeConfig: cfg,
    pendingJobs: pending,
    trackedSymbols: latestSignals.size,
    lastWorkerSession: null,
    ts: Date.now(),
  };
  producer?.send("llm.state.update", status).catch(() => {});
}

async function enqueueIfAllowed(candidate: TriggerCandidate): Promise<string | null> {
  const ep = await getEffectivePolicy();
  if (!isPolicyEnabled(ep)) return null;
  if (!isWithinAllowedHours(ep)) return null;

  const allowed = await shouldEnqueueJob(store, candidate.contextHash, ep);
  if (!allowed) return null;

  const jobId = await store.insertJob({
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

  broadcastStateUpdate().catch(() => {});
  return jobId;
}

createConsumer("orchestrator-signals", ["market.signals"]).then((c) => {
  c.onMessage(async (_topic, raw) => {
    const signal = raw as Signal;
    if (!signal.symbol) return;
    latestSignals.set(signal.symbol, signal);
    const ep = await getEffectivePolicy();
    if (!canAutoTrigger(ep)) return;
    const candidate = await evaluateSignalTrigger(ep, signal);
    if (candidate) await enqueueIfAllowed(candidate);
  });
}).catch(() => {});

createConsumer("orchestrator-recommendations", ["market.recommendations"]).then((c) => {
  c.onMessage(async (_topic, raw) => {
    const rec = raw as TradeRecommendation;
    if (!rec.symbol) return;
    const prev = latestRecs.get(rec.symbol);
    prevRecs.set(rec.symbol, prev ?? rec);
    latestRecs.set(rec.symbol, rec);
    const ep = await getEffectivePolicy();
    if (!canAutoTrigger(ep)) return;
    const candidate = await evaluateRecommendationTrigger(ep, rec, prev);
    if (candidate) await enqueueIfAllowed(candidate);
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
    broadcastStateUpdate().catch(() => {});
  });
}).catch(() => {});

setInterval(async () => {
  const ep = await getEffectivePolicy();
  if (!canAutoTrigger(ep)) return;
  const symbols = [...latestSignals.keys()];
  if (symbols.length === 0) return;
  const [pendingJobs, latestNotes] = await Promise.all([
    Promise.all(symbols.map((s) => store.getJobsBySymbol(s, 5).then((jobs) => ({ s, jobs })))),
    Promise.all(symbols.map((s) => store.getLatestNote(s).then((note) => ({ s, note })))),
  ]);
  const pendingMap = new Map(pendingJobs.map(({ s, jobs }) => [s, jobs]));
  const noteMap = new Map(latestNotes.map(({ s, note }) => [s, note]));
  for (const symbol of symbols) {
    const jobs = pendingMap.get(symbol) ?? [];
    if (jobs.some((j) => j.status === "queued" || j.status === "running")) continue;
    const latest = noteMap.get(symbol) ?? null;
    const candidate = await evaluateStalenessRefreshTrigger(ep, symbol, latest?.createdAt ?? null);
    if (candidate) await enqueueIfAllowed(candidate);
  }
}, 60_000);

setInterval(async () => {
  await store.pruneOldData(7 * 24 * 60 * 60 * 1000);
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
    const ep = await getEffectivePolicy();
    const pending = await store.getPendingJobCount();
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
    const ep = await getEffectivePolicy();
    const pending = await store.getPendingJobCount();
    const status: LlmSubsystemStatus = {
      state: deriveSubsystemState(ep, pending, lastErrorMs, lastActivityMs),
      policy: ep,
      runtimeConfig: await runtimeConfig.getConfig(),
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
    const VALID_TRIGGER_MODES: import("../types/llm-advisory.ts").LlmTriggerMode[] = [
      "disabled", "manual", "on-demand-ui", "scheduled-batch", "event-driven",
    ];
    if (body.triggerMode !== undefined && !VALID_TRIGGER_MODES.includes(body.triggerMode as import("../types/llm-advisory.ts").LlmTriggerMode)) {
      return json({ error: `Invalid triggerMode. Must be one of: ${VALID_TRIGGER_MODES.join(", ")}` }, 400);
    }
    const updatedBy = body.updatedBy ?? "api";
    const updated = await runtimeConfig.updateConfig({
      enabled: body.enabled,
      workerEnabled: body.workerEnabled,
      triggerMode: body.triggerMode as import("../types/llm-advisory.ts").LlmTriggerMode | undefined,
    }, updatedBy);
    broadcastStateUpdate().catch(() => {});
    return json({ status: "updated", runtimeConfig: updated });
  }

  if (path === "/admin/watchlist-brief" && req.method === "POST") {
    const ep = await getEffectivePolicy();
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
        const jobId = await enqueueIfAllowed(candidate);
        if (jobId) jobIds.push(jobId);
      }
    }
    return json({ status: "queued", jobIds, count: jobIds.length }, 202);
  }

  if (path === "/admin/trigger-worker" && req.method === "POST") {
    const ep = await getEffectivePolicy();
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
    const note = await store.getLatestNote(symbol);
    if (!note) return json({ status: "no-advisory", symbol });
    const jobs = await store.getJobsBySymbol(symbol, 5);
    const pendingJob = jobs.find((j) => j.status === "queued" || j.status === "running");
    return json({ ...note, hasPendingJob: !!pendingJob });
  }

  if (path === "/advisory/request" && req.method === "POST") {
    const ep = await getEffectivePolicy();
    if (!canTriggerFromUi(ep)) {
      return json({ error: "LLM advisory is not enabled or trigger mode prevents UI requests" }, 503);
    }
    const body = await req.json() as { symbol?: string; requestedBy?: string };
    if (!body.symbol) return json({ error: "symbol is required" }, 400);
    const candidate = await evaluateUiRequestTrigger(ep, body.symbol, body.requestedBy ?? "unknown");
    if (!candidate) return json({ error: "Could not create trigger candidate" }, 422);
    const jobId = await enqueueIfAllowed(candidate);
    if (!jobId) {
      const jobs = await store.getJobsBySymbol(body.symbol, 5);
      const existingJob = jobs.find((j) => j.status === "queued" || j.status === "running");
      return json({
        status: "deduplicated",
        message: "A recent job already exists for this symbol",
        existingJobId: existingJob?.id ?? null,
      });
    }
    return json({ status: "queued", jobId }, 202);
  }

  if (path === "/advisory/scenario-context" && req.method === "POST") {
    const ep = await getEffectivePolicy();
    if (!isPolicyEnabled(ep)) return json({ status: "disabled" }, 200);
    const body = await req.json() as { symbol?: string; shocks?: Array<{ factor: string }> };
    if (!body.symbol) return json({ error: "symbol is required" }, 400);
    const shockFactors = (body.shocks ?? []).map((s) => s.factor);
    const candidate = await evaluateScenarioTrigger(ep, body.symbol, shockFactors);
    if (!candidate) return json({ status: "skipped" }, 200);
    const jobId = await enqueueIfAllowed(candidate);
    return json({ status: jobId ? "queued" : "deduplicated", jobId }, jobId ? 202 : 200);
  }

  if (path === "/jobs" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    if (symbol) {
      return json(await store.getJobsBySymbol(symbol, 50));
    }
    const jobs: LlmJob[] = [];
    for (const [sym] of latestSignals) {
      const symJobs = await store.getJobsBySymbol(sym, 10);
      jobs.push(...symJobs);
      if (jobs.length >= 50) break;
    }
    return json(jobs.slice(0, 50));
  }

  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "GET") {
    const job = await store.getJob(jobMatch[1]);
    if (!job) return json({ error: "Job not found" }, 404);
    return json(job);
  }

  const jobCancelMatch = path.match(/^\/jobs\/([^/]+)\/cancel$/);
  if (jobCancelMatch && req.method === "PUT") {
    const job = await store.getJob(jobCancelMatch[1]);
    if (!job) return json({ error: "Job not found" }, 404);
    if (job.status !== "queued") return json({ error: "Only queued jobs may be cancelled" }, 409);
    await store.updateJobStatus(job.id, "cancelled");
    return json({ status: "cancelled", jobId: job.id });
  }

  return json({ error: "Not found" }, 404);
});
