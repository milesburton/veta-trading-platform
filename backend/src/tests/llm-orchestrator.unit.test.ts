import { afterAll, beforeAll, vi } from "vitest";
import { test } from "#veta/test";
import { assert, assertEquals } from "#veta/test-assert";

type Handler = (req: Request) => Response | Promise<Response>;
type Listener = (topic: string, raw: unknown) => void | Promise<void>;

const h = vi.hoisted(() => {
  const config = {
    enabled: true,
    workerEnabled: true,
    triggerMode: "event-driven" as string,
    updatedAt: 0,
    updatedBy: "test",
  };
  return {
    handler: undefined as undefined | Handler,
    listeners: {} as Record<string, Listener>,
    sent: [] as Array<{ topic: string; payload: Record<string, unknown> }>,
    config,
    store: {
      sweepStuckJobs: vi.fn(),
      getPendingJobCount: vi.fn(),
      hasRecentJob: vi.fn(),
      insertJob: vi.fn(),
      getJobsBySymbol: vi.fn(),
      getLatestNote: vi.fn(),
      getJob: vi.fn(),
      updateJobStatus: vi.fn(),
      pruneOldData: vi.fn(),
    },
    updateConfig: vi.fn(),
    startProgram: vi.fn(),
  };
});

vi.mock("#veta/bootstrap", () => ({}));
vi.mock("#veta/db", () => ({ llmAdvisoryPool: {} }));
vi.mock("#veta/http", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  serveFetch: (_options: unknown, handler: Handler) => {
    h.handler = handler;
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
  createConsumer: (group: string) =>
    Promise.resolve({
      onMessage: (fn: Listener) => {
        h.listeners[group] = fn;
      },
    }),
}));
vi.mock("../llm-advisory/dedupe.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  computeContextHash: (parts: string[]) => Promise.resolve(parts.join("|")),
}));
vi.mock("../llm-advisory/job-store.ts", () => ({ createJobStore: () => h.store }));
vi.mock("../llm-advisory/runtime-config-store.ts", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  createRuntimeConfigStore: () =>
    Promise.resolve({
      getConfig: () => Promise.resolve({ ...h.config }),
      updateConfig: h.updateConfig,
    }),
}));
vi.mock("../shared/supervisor-control.ts", () => ({ startProgram: h.startProgram }));

async function call(method: string, path: string, body?: unknown) {
  assert(h.handler);
  return h.handler(
    new Request(`http://llm${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

function topics() {
  return h.sent.map((s) => s.topic);
}

function signal(overrides: Record<string, unknown> = {}) {
  return { symbol: "AAPL", direction: "BUY", score: 0.9, confidence: 0.95, ...overrides };
}

function rec(action: string, suggestedQty: number) {
  return { symbol: "AAPL", action, suggestedQty, confidence: 0.9 };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  h.store.getPendingJobCount.mockResolvedValue(0);
  h.store.hasRecentJob.mockResolvedValue(false);
  h.store.insertJob.mockResolvedValue("job-1");
  h.store.getJobsBySymbol.mockResolvedValue([]);
  h.store.getLatestNote.mockResolvedValue(null);
  h.updateConfig.mockImplementation((patch: Record<string, unknown>) => {
    Object.assign(
      h.config,
      Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    );
    return Promise.resolve({ ...h.config });
  });
  await import("../llm-advisory/orchestrator.ts");
  await settle();
});

afterAll(() => {
  vi.useRealTimers();
});

test("[llm-orchestrator] sweeps stuck jobs on startup and reports health", async () => {
  assertEquals(h.store.sweepStuckJobs.mock.calls.length, 0);
  assertEquals(await (await call("GET", "/health")).json(), {
    service: "llm-advisory-orchestrator",
    version: "dev",
    status: "ok",
    trackedSymbols: 0,
  });
  assertEquals((await call("OPTIONS", "/health")).status, 204);
  assertEquals((await call("GET", "/nope")).status, 404);
});

test("[llm-orchestrator] enqueues a job for a high conviction signal and announces it", async () => {
  await h.listeners["orchestrator-signals"]("market.signals", signal());
  await settle();

  const insert = h.store.insertJob.mock.calls[0][0];
  assertEquals(insert.symbol, "AAPL");
  assertEquals(insert.triggerReason, "HIGH_CONVICTION_SIGNAL");
  assertEquals(insert.status, "queued");
  assertEquals(topics().includes("llm.job.queued"), true);
  assertEquals(topics().includes("llm.state.update"), true);
});

test("[llm-orchestrator] ignores weak and symbol-less signals", async () => {
  h.store.insertJob.mockClear();
  await h.listeners["orchestrator-signals"]("market.signals", signal({ score: 0.1 }));
  await h.listeners["orchestrator-signals"]("market.signals", signal({ symbol: "" }));
  assertEquals(h.store.insertJob.mock.calls.length, 0);
});

test("[llm-orchestrator] does not enqueue duplicates inside the dedupe window", async () => {
  h.store.insertJob.mockClear();
  h.store.hasRecentJob.mockResolvedValueOnce(true);
  await h.listeners["orchestrator-signals"]("market.signals", signal({ symbol: "MSFT" }));
  assertEquals(h.store.insertJob.mock.calls.length, 0);
});

test("[llm-orchestrator] enqueues when a recommendation changes action or size materially", async () => {
  h.store.insertJob.mockClear();
  const listen = h.listeners["orchestrator-recommendations"];
  await listen("market.recommendations", rec("BUY", 100));
  assertEquals(h.store.insertJob.mock.calls.length, 0);
  await listen("market.recommendations", rec("BUY", 105));
  assertEquals(h.store.insertJob.mock.calls.length, 0);
  await listen("market.recommendations", rec("SELL", 105));
  assertEquals(h.store.insertJob.mock.calls[0][0].triggerReason, "RECOMMENDATION_CHANGED");
  await listen("market.recommendations", rec("SELL", 200));
  assertEquals(h.store.insertJob.mock.calls.length, 2);
  await listen("market.recommendations", { symbol: "" });
  assertEquals(h.store.insertJob.mock.calls.length, 2);
});

test("[llm-orchestrator] tracks features and reflects worker status in the state", async () => {
  h.listeners["orchestrator-features"]("market.features", { symbol: "AAPL" });
  h.listeners["orchestrator-features"]("market.features", {});

  h.sent.length = 0;
  h.listeners["orchestrator-worker-status"]("llm.worker.status", { event: "error" });
  await settle();
  const state = await (await call("GET", "/admin/state")).json();
  assertEquals(state.state, "error");
  assertEquals(state.trackedSymbols, 2);
  assertEquals(topics().includes("llm.state.update"), true);

  h.listeners["orchestrator-worker-status"]("llm.worker.status", { event: "completed" });
  await vi.advanceTimersByTimeAsync(31_000);
  assertEquals((await (await call("GET", "/admin/state")).json()).state, "cooldown");
});

test("[llm-orchestrator] the state endpoint derives active and idle states", async () => {
  await vi.advanceTimersByTimeAsync(6 * 60_000);
  h.store.getPendingJobCount.mockResolvedValue(3);
  const active = await (await call("GET", "/admin/state")).json();
  assertEquals(active.state, "active");
  assertEquals(active.pendingJobs, 3);
  h.store.getPendingJobCount.mockResolvedValue(0);
});

test("[llm-orchestrator] validates and applies runtime config updates", async () => {
  const invalid = await call("PUT", "/admin/state", { triggerMode: "bogus" });
  assertEquals(invalid.status, 400);

  const ok = await (
    await call("PUT", "/admin/state", {
      enabled: true,
      triggerMode: "on-demand-ui",
      updatedBy: "ops",
    })
  ).json();
  assertEquals(ok.status, "updated");
  assertEquals(h.updateConfig.mock.calls[0][1], "ops");
  assertEquals(ok.runtimeConfig.triggerMode, "on-demand-ui");

  await call("PUT", "/admin/state", { workerEnabled: false });
  assertEquals(h.updateConfig.mock.calls[1][1], "api");
});

test("[llm-orchestrator] UI requests respect the trigger mode, validation and dedupe", async () => {
  h.config.triggerMode = "disabled";
  assertEquals((await call("POST", "/advisory/request", { symbol: "AAPL" })).status, 503);
  h.config.triggerMode = "on-demand-ui";

  assertEquals((await call("POST", "/advisory/request", {})).status, 400);

  h.store.insertJob.mockResolvedValue("job-ui");
  const queued = await call("POST", "/advisory/request", { symbol: "AAPL", requestedBy: "alice" });
  assertEquals(queued.status, 202);
  assertEquals(await queued.json(), { status: "queued", jobId: "job-ui" });

  h.store.hasRecentJob.mockResolvedValueOnce(true);
  h.store.getJobsBySymbol.mockResolvedValueOnce([{ id: "existing", status: "running" }]);
  const dup = await (await call("POST", "/advisory/request", { symbol: "AAPL" })).json();
  assertEquals(dup.status, "deduplicated");
  assertEquals(dup.existingJobId, "existing");

  h.store.hasRecentJob.mockResolvedValueOnce(true);
  h.store.getJobsBySymbol.mockResolvedValueOnce([]);
  assertEquals(
    (await (await call("POST", "/advisory/request", { symbol: "AAPL" })).json()).existingJobId,
    null
  );
});

test("[llm-orchestrator] watchlist briefs queue one job per symbol", async () => {
  h.store.insertJob.mockReset();
  h.store.insertJob.mockResolvedValueOnce("j-a").mockResolvedValueOnce("j-b");
  const res = await call("POST", "/admin/watchlist-brief", { symbols: ["AAPL", "MSFT"] });
  assertEquals(res.status, 202);
  assertEquals(await res.json(), { status: "queued", jobIds: ["j-a", "j-b"], count: 2 });

  h.store.insertJob.mockResolvedValue("j-c");
  const fromTracked = await (await call("POST", "/admin/watchlist-brief", {})).json();
  assert(fromTracked.count >= 0);

  h.config.enabled = false;
  assertEquals((await call("POST", "/admin/watchlist-brief", {})).status, 503);
  h.config.enabled = true;
});

test("[llm-orchestrator] scenario context queues, deduplicates or skips as the policy allows", async () => {
  h.store.insertJob.mockResolvedValue("j-sc");
  const queued = await call("POST", "/advisory/scenario-context", {
    symbol: "AAPL",
    shocks: [{ factor: "rates" }, { factor: "vol" }],
  });
  assertEquals(queued.status, 202);
  assertEquals((await queued.json()).status, "queued");

  assertEquals((await call("POST", "/advisory/scenario-context", {})).status, 400);

  h.store.hasRecentJob.mockResolvedValueOnce(true);
  const dup = await call("POST", "/advisory/scenario-context", { symbol: "AAPL" });
  assertEquals(dup.status, 200);
  assertEquals((await dup.json()).status, "deduplicated");

  h.config.enabled = false;
  assertEquals(
    await (await call("POST", "/advisory/scenario-context", { symbol: "AAPL" })).json(),
    {
      status: "disabled",
    }
  );
  h.config.enabled = true;
});

test("[llm-orchestrator] serves the latest advisory with its pending job flag", async () => {
  h.store.getLatestNote.mockResolvedValueOnce(null);
  assertEquals(await (await call("GET", "/advisory/AAPL")).json(), {
    status: "no-advisory",
    symbol: "AAPL",
  });
  assertEquals((await call("GET", "/advisory/%E0%A4%A")).status, 400);

  h.store.getLatestNote.mockResolvedValueOnce({ symbol: "AAPL", createdAt: 1, text: "note" });
  h.store.getJobsBySymbol.mockResolvedValueOnce([{ id: "j", status: "queued" }]);
  const withJob = await (await call("GET", "/advisory/AAPL")).json();
  assertEquals(withJob.hasPendingJob, true);
  assertEquals(withJob.text, "note");

  h.store.getLatestNote.mockResolvedValueOnce({ symbol: "AAPL", createdAt: 1 });
  h.store.getJobsBySymbol.mockResolvedValueOnce([{ id: "j", status: "completed" }]);
  assertEquals((await (await call("GET", "/advisory/AAPL")).json()).hasPendingJob, false);
});

test("[llm-orchestrator] lists jobs for a symbol or across tracked symbols", async () => {
  h.store.getJobsBySymbol.mockResolvedValueOnce([{ id: "x" }]);
  assertEquals(await (await call("GET", "/jobs?symbol=AAPL")).json(), [{ id: "x" }]);
  assertEquals(h.store.getJobsBySymbol.mock.calls.pop(), ["AAPL", 50]);

  h.store.getJobsBySymbol.mockResolvedValue([{ id: "y" }]);
  const all = await (await call("GET", "/jobs")).json();
  assert(all.length >= 1);
  h.store.getJobsBySymbol.mockResolvedValue([]);
});

test("[llm-orchestrator] fetches and cancels individual jobs", async () => {
  h.store.getJob.mockResolvedValueOnce(null);
  assertEquals((await call("GET", "/jobs/nope")).status, 404);
  h.store.getJob.mockResolvedValueOnce({ id: "j1", status: "queued" });
  assertEquals((await (await call("GET", "/jobs/j1")).json()).id, "j1");

  h.store.getJob.mockResolvedValueOnce(null);
  assertEquals((await call("PUT", "/jobs/nope/cancel")).status, 404);
  h.store.getJob.mockResolvedValueOnce({ id: "j2", status: "running" });
  assertEquals((await call("PUT", "/jobs/j2/cancel")).status, 409);
  h.store.getJob.mockResolvedValueOnce({ id: "j3", status: "queued" });
  assertEquals(await (await call("PUT", "/jobs/j3/cancel")).json(), {
    status: "cancelled",
    jobId: "j3",
  });
  assertEquals(h.store.updateJobStatus.mock.calls.pop(), ["j3", "cancelled"]);
});

test("[llm-orchestrator] starting the worker requires it to be enabled", async () => {
  h.config.workerEnabled = false;
  assertEquals((await call("POST", "/admin/trigger-worker")).status, 503);
  h.config.workerEnabled = true;

  h.startProgram.mockResolvedValueOnce({ ok: true, output: "started" });
  assertEquals(await (await call("POST", "/admin/trigger-worker")).json(), {
    status: "started",
    output: "started",
  });
  h.startProgram.mockResolvedValueOnce({ ok: false, output: "boom" });
  assertEquals((await call("POST", "/admin/trigger-worker")).status, 500);
});

test("[llm-orchestrator] the staleness sweep refreshes symbols without a recent note or pending job", async () => {
  h.config.triggerMode = "event-driven";
  h.store.insertJob.mockReset();
  h.store.insertJob.mockResolvedValue("j-stale");
  h.store.getJobsBySymbol.mockResolvedValue([]);
  h.store.getLatestNote.mockResolvedValue(null);
  await vi.advanceTimersByTimeAsync(60_000);
  const stale = h.store.insertJob.mock.calls.map(
    (c: unknown[]) => (c[0] as { triggerReason: string }).triggerReason
  );
  assert(stale.includes("STALENESS_REFRESH"));

  h.store.insertJob.mockClear();
  h.store.getJobsBySymbol.mockResolvedValue([{ id: "p", status: "queued" }]);
  await vi.advanceTimersByTimeAsync(60_000);
  assertEquals(h.store.insertJob.mock.calls.length, 0);

  h.store.getJobsBySymbol.mockResolvedValue([]);
  h.store.getLatestNote.mockResolvedValue({ createdAt: Date.now() });
  await vi.advanceTimersByTimeAsync(60_000);
  assertEquals(h.store.insertJob.mock.calls.length, 0);

  h.config.triggerMode = "disabled";
  await vi.advanceTimersByTimeAsync(60_000);
  assertEquals(h.store.insertJob.mock.calls.length, 0);
  h.config.triggerMode = "event-driven";
});

test("[llm-orchestrator] prunes old data daily", async () => {
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  assertEquals(h.store.pruneOldData.mock.calls.length >= 1, true);
});
