import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createProducer } from "../lib/messaging.ts";
import { createJobStore } from "./job-store.ts";
import { loadPolicy, isWorkerAllowed } from "./policy.ts";
import { createRuntimeConfigStore, resolveEffectivePolicy } from "./runtime-config-store.ts";
import { buildPrompt, computeSystemPromptHash, SYSTEM_PROMPT } from "./prompt-builder.ts";
import { createMockProvider } from "./providers/mock.ts";
import { createOllamaProvider } from "./providers/ollama.ts";
import type { ILlmProvider } from "./providers/interface.ts";
import { llmAdvisoryPool } from "../lib/db.ts";

const PORT = Number(Deno.env.get("LLM_WORKER_PORT")) || 5_033;
const JOURNAL_URL = Deno.env.get("JOURNAL_URL") || "http://localhost:5009";
const FEATURE_ENGINE_URL = Deno.env.get("FEATURE_ENGINE_URL") || "http://localhost:5017";
const SIGNAL_ENGINE_URL = Deno.env.get("SIGNAL_ENGINE_URL") || "http://localhost:5018";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MAX_RETRIES = 3;

const basePolicy = loadPolicy();
const store = createJobStore(llmAdvisoryPool);
const runtimeConfig = await createRuntimeConfigStore(llmAdvisoryPool);

const effectivePolicy = resolveEffectivePolicy(basePolicy, await runtimeConfig.getConfig());

if (!isWorkerAllowed(effectivePolicy)) {
  console.log("[llm-worker] LLM_ENABLED or LLM_WORKER_ENABLED is false — exiting");
  Deno.exit(0);
}

const IDLE_TIMEOUT_MS = effectivePolicy.workerIdleTimeoutSeconds * 1_000;
const MAX_JOBS_PER_SESSION = effectivePolicy.workerMaxJobsPerSession;

function buildProvider(): ILlmProvider {
  if (effectivePolicy.provider === "ollama") {
    return createOllamaProvider(effectivePolicy.modelId, effectivePolicy.ollamaBaseUrl);
  }
  return createMockProvider();
}

const provider = buildProvider();

const available = await provider.isAvailable();
if (!available) {
  console.warn(`[llm-worker] Provider '${effectivePolicy.provider}' is not available — exiting`);
  Deno.exit(0);
}

const producer = await createProducer("llm-worker").catch((err) => {
  console.warn("[llm-worker] Redpanda unavailable:", err.message);
  return null;
});

const sessionId = await store.insertWorkerSession({
  startedAt: Date.now(),
  endedAt: null,
  provider: provider.providerId,
  modelId: provider.modelId,
  jobsProcessed: 0,
  jobsFailed: 0,
  pid: Deno.pid,
  exitReason: null,
});

console.log(`[llm-worker] Session ${sessionId} started. Provider: ${provider.providerId}. Max jobs: ${MAX_JOBS_PER_SESSION}. Idle timeout: ${IDLE_TIMEOUT_MS}ms`);

producer?.send("llm.worker.status", {
  event: "started",
  sessionId,
  jobsProcessed: 0,
  jobsFailed: 0,
  ts: Date.now(),
}).catch(() => {});

let jobsProcessed = 0;
let jobsFailed = 0;

async function fetchRecentCloses(symbol: string): Promise<number[]> {
  try {
    const url = `${JOURNAL_URL}/candles?instrument=${encodeURIComponent(symbol)}&interval=1m&limit=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return [];
    const candles = await res.json() as Array<{ close: number }>;
    return candles.map((c) => c.close).filter((v) => v > 0);
  } catch {
    return [];
  }
}

async function fetchSignal(symbol: string) {
  try {
    const url = `${SIGNAL_ENGINE_URL}/signals/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchFeatureVector(symbol: string) {
  try {
    const url = `${FEATURE_ENGINE_URL}/features/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const systemPromptHash = await computeSystemPromptHash();

async function processJob(jobId: string): Promise<boolean> {
  const job = await store.getJob(jobId);
  if (!job) return false;

  try {
    const [fv, signal, closes] = await Promise.all([
      fetchFeatureVector(job.symbol),
      fetchSignal(job.symbol),
      fetchRecentCloses(job.symbol),
    ]);

    const signalSnapshot = JSON.stringify(signal ?? { symbol: job.symbol, contextHash: job.contextHash });
    const resolvedSignal = signal ?? {
      symbol: job.symbol,
      score: 0,
      direction: "neutral" as const,
      confidence: 0,
      factors: [],
      ts: Date.now(),
    };

    const prompt = buildPrompt(job.symbol, resolvedSignal, fv, null, closes);
    const contextSizeChars = prompt.length;

    await store.insertPromptAudit({
      jobId: job.id,
      promptText: prompt,
      systemPromptHash,
      contextSizeChars,
      ts: Date.now(),
    });

    const response = await provider.generate(prompt, SYSTEM_PROMPT);

    await store.insertResponseAudit({
      jobId: job.id,
      rawResponse: response.rawResponse,
      parsedSuccessfully: true,
      parseErrorMessage: null,
      ts: Date.now(),
    });

    const noteId = await store.insertNote({
      jobId: job.id,
      symbol: job.symbol,
      content: response.text,
      provider: provider.providerId,
      modelId: provider.modelId,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      latencyMs: response.latencyMs,
      signalSnapshot,
      recommendationSnapshot: null,
      createdAt: Date.now(),
    });

    await store.updateJobStatus(job.id, "done", { completedAt: Date.now() });

    producer?.send("llm.advisory.ready", {
      jobId: job.id,
      symbol: job.symbol,
      noteId,
      content: response.text,
      provider: provider.providerId,
      modelId: provider.modelId,
      createdAt: Date.now(),
      ts: Date.now(),
    }).catch(() => {});

    producer?.send("llm.worker.status", {
      event: "completed",
      sessionId,
      symbol: job.symbol,
      jobId: job.id,
      ts: Date.now(),
    }).catch(() => {});

    jobsProcessed++;
    await store.updateWorkerSession(sessionId, { jobsProcessed });
    return true;
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[llm-worker] Job ${job.id} failed:`, errMsg);

    producer?.send("llm.worker.status", {
      event: "error",
      sessionId,
      symbol: job.symbol,
      jobId: job.id,
      error: errMsg,
      ts: Date.now(),
    }).catch(() => {});

    const newRetryCount = job.retryCount + 1;
    if (newRetryCount >= MAX_RETRIES) {
      await store.updateJobStatus(job.id, "failed", {
        completedAt: Date.now(),
        errorMessage: errMsg,
        retryCount: newRetryCount,
      });
      jobsFailed++;
      await store.updateWorkerSession(sessionId, { jobsFailed });
    } else {
      await store.updateJobStatus(job.id, "queued", { retryCount: newRetryCount });
    }
    return false;
  }
}

const server = Deno.serve({ port: PORT }, (_req: Request): Response => {
  return new Response(JSON.stringify({
    service: "llm-worker",
    version: VERSION,
    status: "ok",
    sessionId,
    jobsProcessed,
    jobsFailed,
    provider: provider.providerId,
    modelId: provider.modelId,
  }), { headers: { "Content-Type": "application/json" } });
});

console.log("[llm-worker] Entering work loop");

let exitReason = "queue-exhausted";
const sessionStart = Date.now();

outer: while (true) {
  if (jobsProcessed >= MAX_JOBS_PER_SESSION) {
    exitReason = "max-jobs-per-session";
    console.log(`[llm-worker] Reached max jobs per session (${MAX_JOBS_PER_SESSION}) — exiting`);
    break;
  }

  const job = await store.claimNextJob(sessionId);
  if (!job) {
    console.log(`[llm-worker] Queue empty — waiting up to ${IDLE_TIMEOUT_MS}ms for new jobs`);
    const deadline = Date.now() + IDLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2_000));
      const next = await store.claimNextJob(sessionId);
      if (next) {
        if (jobsProcessed >= MAX_JOBS_PER_SESSION) {
          await store.updateJobStatus(next.id, "queued");
          exitReason = "max-jobs-per-session";
          break outer;
        }
        console.log(`[llm-worker] Processing job ${next.id} for ${next.symbol} (${next.triggerReason})`);
        await processJob(next.id);
        continue outer;
      }
    }
    exitReason = "idle-timeout";
    console.log(`[llm-worker] Idle timeout reached — exiting`);
    break;
  }

  console.log(`[llm-worker] Processing job ${job.id} for ${job.symbol} (${job.triggerReason})`);
  await processJob(job.id);
}

await store.updateWorkerSession(sessionId, { endedAt: Date.now(), exitReason });

producer?.send("llm.worker.status", {
  event: "stopped",
  sessionId,
  jobsProcessed,
  jobsFailed,
  exitReason,
  durationMs: Date.now() - sessionStart,
  ts: Date.now(),
}).catch(() => {});

console.log(`[llm-worker] Session ended. Reason: ${exitReason}. Processed: ${jobsProcessed}, failed: ${jobsFailed}`);
await server.shutdown();
Deno.exit(0);
