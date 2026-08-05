/**
 * Load tests — require all backend services to be running.
 *
 * These tests inject high volumes of orders via the gateway load-test endpoint
 * (admin-only), then assert pipeline throughput, fill rates, and system health
 * under load. Run separately from smoke/integration tests:
 *
 *   deno test --allow-all backend/src/tests/load.test.ts
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import {
  ARCHIVE_URL,
  GATEWAY_URL,
  JOURNAL_URL,
  loginAs,
  OBS_URL,
  timeout as t,
} from "./test-helpers.ts";

const SLA_INGESTION_ORDER_COUNT = 100;
const SLA_INGESTION_THRESHOLD = 0.9;
const SLA_INGESTION_MIN = Math.ceil(SLA_INGESTION_ORDER_COUNT * SLA_INGESTION_THRESHOLD);
const SLA_INGESTION_WINDOW_MS = 30_000;

const SLA_FILL_ORDER_COUNT = 50;
const SLA_FILL_RATE = 0.8;
const SLA_FILL_MIN = Math.ceil(SLA_FILL_ORDER_COUNT * SLA_FILL_RATE);
const SLA_FILL_WINDOW_MS = 60_000;

const SLA_OBS_COVERAGE = 0.5;
const SLA_HEALTH_SETTLE_MS = 5_000;
const SLA_PIPELINE_LATENCY_MS = 30_000;

function loginAsAdmin(): Promise<string> {
  return loginAs("admin");
}

interface LoadTestResult {
  jobId: string;
  submitted: number;
  symbols: string[];
  strategy: string;
}

async function triggerLoadTest(
  adminToken: string,
  opts: { orderCount?: number; symbols?: string[]; strategy?: string }
): Promise<LoadTestResult> {
  const res = await fetch(`${GATEWAY_URL}/load-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `veta_user=${adminToken}`,
    },
    body: JSON.stringify(opts),
    signal: t(30_000),
  });
  assertEquals(res.status, 202, `load-test endpoint returned ${res.status}`);
  return res.json() as Promise<LoadTestResult>;
}

async function queryOrderBlotterTotal(jobId: string, status?: string): Promise<number | null> {
  const rules: Array<Record<string, string>> = [
    {
      kind: "rule",
      id: "r1",
      field: "id",
      op: "contains",
      value: jobId,
    },
  ];
  if (status) {
    rules.push({
      kind: "rule",
      id: "r2",
      field: "status",
      op: "=",
      value: status,
    });
  }

  const res = await fetch(`${JOURNAL_URL}/grid/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gridId: "orderBlotter",
      filterExpr: {
        kind: "group",
        id: "root",
        join: "AND",
        rules,
      },
      sortField: null,
      sortDir: null,
      offset: 0,
      limit: 200,
    }),
    signal: t(20_000),
  });

  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }

  const data = (await res.json()) as { total: number };
  return data.total;
}

// ── Access control ────────────────────────────────────────────────────────────

Deno.test("[load] /load-test requires authentication", async () => {
  const res = await fetch(`${GATEWAY_URL}/load-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderCount: 1 }),
    signal: t(),
  });
  assertEquals(res.status, 401, "Expected 401 without auth");
  await res.body?.cancel();
});

Deno.test("[load] /load-test requires admin role (trader is rejected)", async () => {
  const token = await loginAs("alice");
  const res = await fetch(`${GATEWAY_URL}/load-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `veta_user=${token}`,
    },
    body: JSON.stringify({ orderCount: 1 }),
    signal: t(),
  });
  assertEquals(res.status, 403, "Expected 403 for trader role");
  await res.body?.cancel();
});

// ── Submission ─────────────────────────────────────────────────────────────────

Deno.test("[load] admin can submit 50 orders and receives jobId", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: 50,
    strategy: "LIMIT",
  });

  assertExists(result.jobId, "jobId must be present");
  assertEquals(result.submitted, 50, `Expected 50 submitted, got ${result.submitted}`);
  assert(result.symbols.length > 0, "symbols array must be non-empty");
  assertEquals(result.strategy, "LIMIT");
});

Deno.test("[load] orderCount is capped at 5000", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: 99_999,
    strategy: "LIMIT",
  });

  assertEquals(
    result.submitted,
    5000,
    `Expected submitted to be capped at 5000, got ${result.submitted}`
  );
});

// ── Pipeline throughput ────────────────────────────────────────────────────────

Deno.test("[load] 100-order burst: all orders appear in journal within 30s", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: SLA_INGESTION_ORDER_COUNT,
    strategy: "LIMIT",
  });

  const jobId = result.jobId;
  const deadline = Date.now() + SLA_INGESTION_WINDOW_MS;
  let seenCount = 0;

  while (Date.now() < deadline) {
    const total = await queryOrderBlotterTotal(jobId);
    if (typeof total === "number") {
      seenCount = total;
      if (seenCount >= SLA_INGESTION_ORDER_COUNT) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  assert(
    seenCount >= SLA_INGESTION_MIN,
    `Expected ≥${SLA_INGESTION_MIN}/${SLA_INGESTION_ORDER_COUNT} orders in journal within ${SLA_INGESTION_WINDOW_MS}ms, got ${seenCount}`
  );
});

Deno.test("[load] 100-order burst: observability receives orders.submitted events", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: SLA_INGESTION_ORDER_COUNT,
    strategy: "LIMIT",
    symbols: ["AAPL", "MSFT"],
  });

  const jobId = result.jobId;
  const deadline = Date.now() + SLA_INGESTION_WINDOW_MS;
  let matchCount = 0;
  const obsMin = Math.ceil(SLA_INGESTION_ORDER_COUNT * SLA_OBS_COVERAGE);

  while (Date.now() < deadline) {
    const res = await fetch(`${OBS_URL}/events?type=orders.submitted`, {
      signal: t(10_000),
    });
    if (res.ok) {
      const events = (await res.json()) as Array<{ payload: Record<string, unknown> }>;
      matchCount = events.filter(
        (e) =>
          typeof e.payload?.clientOrderId === "string" &&
          (e.payload.clientOrderId as string).startsWith(jobId)
      ).length;
      if (matchCount >= obsMin) break;
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  assert(
    matchCount >= obsMin,
    `Expected ≥${obsMin} orders.submitted events for job ${jobId}, got ${matchCount}`
  );
});

// ── Fill throughput ────────────────────────────────────────────────────────────

Deno.test("[load] 50 LIMIT orders: ≥80% fill rate within 60s", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: SLA_FILL_ORDER_COUNT,
    strategy: "LIMIT",
  });

  const jobId = result.jobId;
  const deadline = Date.now() + SLA_FILL_WINDOW_MS;
  let filledCount = 0;

  while (Date.now() < deadline) {
    const total = await queryOrderBlotterTotal(jobId, "filled");
    if (typeof total === "number") {
      filledCount = total;
      if (filledCount >= SLA_FILL_MIN) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }

  const fillRate = filledCount / SLA_FILL_ORDER_COUNT;
  assert(
    fillRate >= SLA_FILL_RATE,
    `Fill rate ${(fillRate * 100).toFixed(1)}% below ${(SLA_FILL_RATE * 100).toFixed(
      0
    )}% SLA (${filledCount}/${SLA_FILL_ORDER_COUNT} filled within ${SLA_FILL_WINDOW_MS}ms)`
  );
});

// ── FIX archive under load ────────────────────────────────────────────────────

Deno.test("[load] FIX archive grows after load injection", async () => {
  const beforeRes = await fetch(`${ARCHIVE_URL}/health`, { signal: t() });
  const before = ((await beforeRes.json()) as { executions: number }).executions;

  const token = await loginAsAdmin();
  await triggerLoadTest(token, { orderCount: 20, strategy: "LIMIT" });

  const deadline = Date.now() + 30_000;
  let after = before;
  while (Date.now() < deadline) {
    const res = await fetch(`${ARCHIVE_URL}/health`, { signal: t() });
    const body = (await res.json()) as { executions: number };
    after = body.executions;
    if (after > before) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }

  assert(
    after > before,
    `FIX archive execution count did not increase: before=${before}, after=${after}`
  );
});

// ── System stability after load ───────────────────────────────────────────────

Deno.test("[load] pipeline latency: 90% of orders visible in journal within SLA budget", async () => {
  const token = await loginAsAdmin();
  const t0 = Date.now();
  const result = await triggerLoadTest(token, {
    orderCount: SLA_INGESTION_ORDER_COUNT,
    strategy: "LIMIT",
  });

  const jobId = result.jobId;
  const deadline = t0 + SLA_PIPELINE_LATENCY_MS;
  let seenCount = 0;

  while (Date.now() < deadline) {
    const total = await queryOrderBlotterTotal(jobId);
    if (typeof total === "number") {
      seenCount = total;
      if (seenCount >= SLA_INGESTION_MIN) {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  const elapsed = Date.now() - t0;
  assert(
    seenCount >= SLA_INGESTION_MIN,
    `Only ${seenCount}/${SLA_INGESTION_ORDER_COUNT} orders visible after ${elapsed}ms`
  );
  assert(
    elapsed <= SLA_PIPELINE_LATENCY_MS,
    `Pipeline latency ${elapsed}ms exceeds SLA of ${SLA_PIPELINE_LATENCY_MS}ms`
  );
});

Deno.test("[load] LIMIT pipeline percentiles within budget after 100-order burst", async () => {
  const ORDER_COUNT = 100;
  const SETTLE_MS = 90_000;
  const SUBMITTED_TO_FILLED_P99_BUDGET_MS = 2_000;
  const SUBMITTED_TO_ARRIVED_P99_BUDGET_MS = 250;
  const MIN_SAMPLE_FRACTION = 0.6;

  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: ORDER_COUNT,
    strategy: "LIMIT",
  });
  assertEquals(result.submitted, ORDER_COUNT);

  await new Promise((r) => setTimeout(r, SETTLE_MS));

  const res = await fetch(`${JOURNAL_URL}/metrics/latency?windowMs=${SETTLE_MS + 30_000}`, {
    signal: t(10_000),
  });
  assertEquals(res.status, 200);
  const m = (await res.json()) as {
    sampleSize: number;
    stages: Record<string, { count: number; p50: number; p95: number; p99: number; max: number }>;
  };

  const minSamples = Math.ceil(ORDER_COUNT * MIN_SAMPLE_FRACTION);
  assert(
    m.sampleSize >= minSamples,
    `sampleSize ${m.sampleSize} below minimum ${minSamples} (${ORDER_COUNT} submitted)`
  );

  const filled = m.stages.submittedToFilled;
  assert(
    filled.count >= minSamples,
    `submittedToFilled.count ${filled.count} below minimum ${minSamples}`
  );
  assert(
    filled.p99 <= SUBMITTED_TO_FILLED_P99_BUDGET_MS,
    `submittedToFilled.p99 = ${filled.p99}ms exceeds budget ${SUBMITTED_TO_FILLED_P99_BUDGET_MS}ms ` +
      `(p50=${filled.p50}ms p95=${filled.p95}ms max=${filled.max}ms)`
  );

  const arrived = m.stages.submittedToArrived;
  assert(
    arrived.p99 <= SUBMITTED_TO_ARRIVED_P99_BUDGET_MS,
    `submittedToArrived.p99 = ${arrived.p99}ms exceeds budget ${SUBMITTED_TO_ARRIVED_P99_BUDGET_MS}ms ` +
      `(journal ingestion lag — bus or DB write batcher saturated?)`
  );
});

Deno.test("[load] all services remain healthy after 100-order burst", async () => {
  const token = await loginAsAdmin();
  await triggerLoadTest(token, {
    orderCount: SLA_INGESTION_ORDER_COUNT,
    strategy: "LIMIT",
  });

  await new Promise((r) => setTimeout(r, SLA_HEALTH_SETTLE_MS));

  const services = [
    { name: "gateway", url: GATEWAY_URL },
    { name: "journal", url: JOURNAL_URL },
    { name: "obs", url: OBS_URL },
    { name: "archive", url: ARCHIVE_URL },
  ];

  for (const svc of services) {
    const res = await fetch(`${svc.url}/health`, { signal: t() });
    assertEquals(res.status, 200, `${svc.name} /health returned ${res.status} after load`);
    const body = (await res.json()) as { status: string };
    assertEquals(body.status, "ok", `${svc.name} reported non-ok status after load`);
  }
});
