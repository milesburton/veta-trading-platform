import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createProducer } from "../lib/messaging.ts";
import { JobStore } from "./job-store.ts";
import { loadPolicy } from "./policy.ts";
import { buildPrompt, computeSystemPromptHash, SYSTEM_PROMPT } from "./prompt-builder.ts";
import { MockProvider } from "./providers/mock.ts";
import { OllamaProvider } from "./providers/ollama.ts";
import type { ILlmProvider } from "./providers/interface.ts";

const PORT = Number(Deno.env.get("LLM_WORKER_PORT")) || 5_025;
const DB_PATH = Deno.env.get("LLM_ADVISORY_DB_PATH") || "./backend/data/llm-advisory.db";
const JOURNAL_URL = Deno.env.get("JOURNAL_URL") || "http://localhost:5009";
const FEATURE_ENGINE_URL = Deno.env.get("FEATURE_ENGINE_URL") || "http://localhost:5017";
const SIGNAL_ENGINE_URL = Deno.env.get("SIGNAL_ENGINE_URL") || "http://localhost:5018";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MAX_RETRIES = 3;

const policy = loadPolicy();

if (!policy.enabled) {
  console.log("[llm-worker] LLM_ADVISORY_ENABLED is not set — exiting");
  Deno.exit(0);
}

function buildProvider(): ILlmProvider {
  if (policy.provider === "ollama") {
    return new OllamaProvider(policy.modelId, policy.ollamaBaseUrl);
  }
  return new MockProvider();
}

const provider = buildProvider();

const available = await provider.isAvailable();
if (!available) {
  console.warn(`[llm-worker] Provider '${policy.provider}' is not available — exiting`);
  Deno.exit(0);
}

const store = new JobStore(DB_PATH);

const producer = await createProducer("llm-worker").catch((err) => {
  console.warn("[llm-worker] Redpanda unavailable:", err.message);
  return null;
});

const sessionId = store.insertWorkerSession({
  startedAt: Date.now(),
  endedAt: null,
  provider: provider.providerId,
  modelId: provider.modelId,
  jobsProcessed: 0,
  jobsFailed: 0,
  pid: Deno.pid,
});

console.log(`[llm-worker] Session ${sessionId} started. Provider: ${provider.providerId}`);

producer?.send("llm.worker.status", {
  sessionId,
  status: "started",
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
  const job = store.getJob(jobId);
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

    store.insertPromptAudit({
      jobId: job.id,
      promptText: prompt,
      systemPromptHash,
      contextSizeChars,
      ts: Date.now(),
    });

    const response = await provider.generate(prompt, SYSTEM_PROMPT);

    store.insertResponseAudit({
      jobId: job.id,
      rawResponse: response.rawResponse,
      parsedSuccessfully: true,
      parseErrorMessage: null,
      ts: Date.now(),
    });

    const noteId = store.insertNote({
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

    store.updateJobStatus(job.id, "done", { completedAt: Date.now() });

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

    jobsProcessed++;
    store.updateWorkerSession(sessionId, { jobsProcessed });
    return true;
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error(`[llm-worker] Job ${job.id} failed:`, errMsg);

    const newRetryCount = job.retryCount + 1;
    if (newRetryCount >= MAX_RETRIES) {
      store.updateJobStatus(job.id, "failed", {
        completedAt: Date.now(),
        errorMessage: errMsg,
        retryCount: newRetryCount,
      });
      jobsFailed++;
      store.updateWorkerSession(sessionId, { jobsFailed });
    } else {
      store.updateJobStatus(job.id, "queued", { retryCount: newRetryCount });
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
while (true) {
  const job = store.claimNextJob(sessionId);
  if (!job) {
    console.log(`[llm-worker] Queue empty. Processed: ${jobsProcessed}, failed: ${jobsFailed}`);
    break;
  }
  console.log(`[llm-worker] Processing job ${job.id} for ${job.symbol} (${job.triggerReason})`);
  await processJob(job.id);
}

store.updateWorkerSession(sessionId, { endedAt: Date.now() });

producer?.send("llm.worker.status", {
  sessionId,
  status: "stopped",
  jobsProcessed,
  jobsFailed,
  ts: Date.now(),
}).catch(() => {});

console.log("[llm-worker] Session ended cleanly");
server.shutdown();
store.close();
Deno.exit(0);
