import { afterEach, beforeEach, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;

interface FakeJob {
  id: string;
  symbol: string;
  contextHash: string;
  triggerReason: string;
  retryCount: number;
}

const h = vi.hoisted(() => ({
  handler: undefined as undefined | Handler,
  sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
  config: {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual",
    updatedAt: 0,
    updatedBy: "t",
  },
  available: true,
  queue: [] as unknown[],
  jobs: {} as Record<string, unknown>,
  store: {
    insertWorkerSession: vi.fn(),
    updateWorkerSession: vi.fn(),
    claimNextJob: vi.fn(),
    getJob: vi.fn(),
    insertPromptAudit: vi.fn(),
    insertResponseAudit: vi.fn(),
    insertNote: vi.fn(),
    updateJobStatus: vi.fn(),
  },
  generate: vi.fn(),
  providerFactory: vi.fn(),
  parseTicket: vi.fn(),
  serverClose: vi.fn(),
}));

class ExitSignal extends Error {
  code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/db", () => ({ llmAdvisoryPool: {} }));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
    return { close: h.serverClose };
  },
}));
vi.mock("#veta/messaging", () => ({
  createProducer: () =>
    Promise.resolve({
      send: (topic: string, payload: Record<string, unknown>) => {
        h.sent.push({ topic, payload });
        return Promise.resolve();
      },
    }),
}));
vi.mock("../llm-advisory/job-store.ts", () => ({ createJobStore: () => h.store }));
vi.mock("../llm-advisory/runtime-config-store.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  createRuntimeConfigStore: () => Promise.resolve({ getConfig: () => Promise.resolve(h.config) }),
}));
vi.mock("../llm-advisory/parse-ticket-handler.ts", () => ({ handleParseTicket: h.parseTicket }));
const provider = () => ({
  providerId: "fake",
  modelId: "fake-model",
  isAvailable: () => Promise.resolve(h.available),
  generate: h.generate,
});
vi.mock("../llm-advisory/providers/mock.ts", () => ({
  createMockProvider: () => {
    h.providerFactory("mock");
    return provider();
  },
}));
vi.mock("../llm-advisory/providers/ollama.ts", () => ({
  createOllamaProvider: (...args: unknown[]) => {
    h.providerFactory("ollama", ...args);
    return provider();
  },
}));
vi.mock("../llm-advisory/providers/anthropic.ts", () => ({
  createAnthropicProvider: (...args: unknown[]) => {
    h.providerFactory("anthropic", ...args);
    return provider();
  },
}));

const realSetTimeout = globalThis.setTimeout;

function job(id: string, retryCount = 0): FakeJob {
  return { id, symbol: "AAPL", contextHash: "hash", triggerReason: "UI_REQUEST", retryCount };
}

function addJob(j: FakeJob) {
  h.jobs[j.id] = j;
  return j;
}

function topics() {
  return h.sent.map((s) => s.topic);
}

function exitCodeOf(err: unknown): number {
  if (!(err instanceof ExitSignal))
    throw new Error(`unexpected outcome: ${String((err as Error)?.stack ?? err)}`);
  return err.code;
}

async function runWorker(env: Record<string, string> = {}): Promise<number> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  let outcome: unknown = "pending";
  import("../llm-advisory/worker.ts").then(
    () => (outcome = "resolved"),
    (err) => (outcome = err)
  );
  for (let i = 0; i < 1_000 && outcome === "pending"; i++) {
    await vi.advanceTimersByTimeAsync(2_500);
    await new Promise((r) => realSetTimeout(r, 2));
  }
  return exitCodeOf(outcome);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  h.sent.length = 0;
  h.queue = [];
  h.jobs = {};
  h.available = true;
  h.config = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "manual",
    updatedAt: 0,
    updatedBy: "t",
  };
  for (const fn of [
    ...Object.values(h.store),
    h.generate,
    h.providerFactory,
    h.parseTicket,
    h.serverClose,
  ]) {
    fn.mockReset();
  }
  h.store.insertWorkerSession.mockResolvedValue("sess-1");
  h.store.claimNextJob.mockImplementation(() => Promise.resolve(h.queue.shift() ?? null));
  h.store.getJob.mockImplementation((id: string) => Promise.resolve(h.jobs[id] ?? null));
  h.store.insertNote.mockResolvedValue("note-1");
  h.generate.mockResolvedValue({
    text: "advice",
    rawResponse: "raw",
    promptTokens: 10,
    completionTokens: 20,
    latencyMs: 30,
  });
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ExitSignal(Number(code ?? 0));
  });
  vi.stubGlobal("fetch", (input: string) => {
    const url = String(input);
    if (url.includes("/candles")) {
      return Promise.resolve(
        new Response(JSON.stringify([{ close: 100 }, { close: 0 }, { close: 101 }]))
      );
    }
    if (url.includes("/signals/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            symbol: "AAPL",
            score: 0.9,
            direction: "BUY",
            confidence: 0.9,
            factors: [],
            ts: 1,
          })
        )
      );
    }
    return Promise.resolve(new Response("{}", { status: 500 }));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("[llm-worker] exits immediately when the worker is disabled", async () => {
  h.config.workerEnabled = false;
  assertEquals(await runWorker(), 0);
  assertEquals(h.store.insertWorkerSession.mock.calls.length, 0);
});

test("[llm-worker] exits when the provider is unavailable", async () => {
  h.available = false;
  assertEquals(await runWorker(), 0);
  assertEquals(h.store.insertWorkerSession.mock.calls.length, 0);
});

test("[llm-worker] selects the configured provider", async () => {
  await runWorker({
    LLM_PROVIDER: "ollama",
    LLM_MODEL_ID: "llama",
    LLM_OLLAMA_BASE_URL: "http://o",
  });
  assertEquals(h.providerFactory.mock.calls[0], ["ollama", "llama", "http://o"]);

  h.providerFactory.mockClear();
  await runWorker({ LLM_PROVIDER: "anthropic", LLM_MODEL_ID: "claude" });
  assertEquals(h.providerFactory.mock.calls[0], ["anthropic", "claude"]);

  h.providerFactory.mockClear();
  await runWorker({ LLM_PROVIDER: "mock" });
  assertEquals(h.providerFactory.mock.calls[0], ["mock"]);
});

test("[llm-worker] processes a claimed job end to end and then exits on idle timeout", async () => {
  h.queue.push(addJob(job("j-1")));
  const code = await runWorker({ LLM_WORKER_IDLE_TIMEOUT_SECONDS: "3" });
  assertEquals(code, 0);

  assertEquals(h.store.insertPromptAudit.mock.calls[0][0].jobId, "j-1");
  assert(h.store.insertPromptAudit.mock.calls[0][0].promptText.includes("AAPL"));
  assertEquals(h.store.insertResponseAudit.mock.calls[0][0].rawResponse, "raw");
  assertEquals(h.store.insertNote.mock.calls[0][0].content, "advice");
  assertEquals(h.store.updateJobStatus.mock.calls[0].slice(0, 2), ["j-1", "done"]);
  assertEquals(h.store.updateWorkerSession.mock.calls[0], ["sess-1", { jobsProcessed: 1 }]);

  const final = h.store.updateWorkerSession.mock.calls.pop();
  assertEquals(final?.[1].exitReason, "idle-timeout");
  assertEquals(topics(), [
    "llm.worker.status",
    "llm.advisory.ready",
    "llm.worker.status",
    "llm.worker.status",
  ]);
  assertEquals(h.sent[0].payload.event, "started");
  assertEquals(h.sent[h.sent.length - 1].payload.event, "stopped");
  assertEquals(h.serverClose.mock.calls.length, 1);
});

test("[llm-worker] exits after the maximum jobs per session", async () => {
  h.queue.push(addJob(job("j-1")), addJob(job("j-2")));
  await runWorker({ LLM_WORKER_MAX_JOBS_PER_SESSION: "1" });

  assertEquals(h.store.insertNote.mock.calls.length, 1);
  const final = h.store.updateWorkerSession.mock.calls.pop();
  assertEquals(final?.[1].exitReason, "max-jobs-per-session");
});

test("[llm-worker] picks up jobs that arrive while idle", async () => {
  h.store.claimNextJob
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(addJob(job("late-1")))
    .mockResolvedValue(null);
  await runWorker({ LLM_WORKER_IDLE_TIMEOUT_SECONDS: "3" });
  assertEquals(h.store.insertNote.mock.calls[0][0].jobId, "late-1");
});

test("[llm-worker] a job that disappears is skipped", async () => {
  h.queue.push(job("ghost"));
  await runWorker({ LLM_WORKER_IDLE_TIMEOUT_SECONDS: "1" });
  assertEquals(h.store.insertNote.mock.calls.length, 0);
});

test("[llm-worker] a failing job is requeued until retries run out, then marked failed", async () => {
  h.generate.mockRejectedValue(new Error("model down"));
  h.queue.push(addJob(job("retry", 0)), addJob(job("last", 2)));
  await runWorker({ LLM_WORKER_IDLE_TIMEOUT_SECONDS: "1" });

  const updates = h.store.updateJobStatus.mock.calls;
  assertEquals(updates[0], ["retry", "queued", { retryCount: 1 }]);
  assertEquals(updates[1][0], "last");
  assertEquals(updates[1][1], "failed");
  assertEquals(updates[1][2].errorMessage, "model down");
  assertEquals(updates[1][2].retryCount, 3);
  assertEquals(h.store.updateWorkerSession.mock.calls[0], ["sess-1", { jobsFailed: 1 }]);
  assertEquals(topics().filter((t) => t === "llm.worker.status").length >= 3, true);
  assert(h.sent.some((s) => s.payload.event === "error" && s.payload.error === "model down"));
});

test("[llm-worker] falls back to a neutral signal when upstream context is unavailable", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  h.queue.push(addJob(job("blind")));
  await runWorker({ LLM_WORKER_IDLE_TIMEOUT_SECONDS: "1" });
  const note = h.store.insertNote.mock.calls[0][0];
  assertEquals(JSON.parse(note.signalSnapshot), { symbol: "AAPL", contextHash: "hash" });
});

test("[llm-worker] serves status and delegates ticket parsing", async () => {
  h.parseTicket.mockResolvedValue(new Response("parsed", { status: 201 }));
  await runWorker({ LLM_WORKER_IDLE_TIMEOUT_SECONDS: "1" });
  assert(h.handler);

  const status = await h.handler(new Request("http://w/anything"));
  const body = await status.json();
  assertEquals(body.service, "llm-worker");
  assertEquals(body.sessionId, "sess-1");
  assertEquals(body.provider, "fake");

  const parsed = await h.handler(new Request("http://w/parse-ticket", { method: "POST" }));
  assertEquals(parsed.status, 201);
  assertEquals(h.parseTicket.mock.calls.length, 1);
});
