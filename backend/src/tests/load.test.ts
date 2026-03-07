/**
 * Load tests — require all backend services to be running.
 *
 * These tests inject high volumes of orders via the gateway load-test endpoint
 * (admin-only), then assert pipeline throughput, fill rates, and system health
 * under load. Run separately from smoke/integration tests:
 *
 *   deno test --allow-all backend/src/tests/load.test.ts
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";
import {
  GATEWAY_URL,
  JOURNAL_URL,
  OBS_URL,
  ARCHIVE_URL,
  loginAs,
  timeout as t,
} from "./test-helpers.ts";

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
  opts: { orderCount?: number; symbols?: string[]; strategy?: string },
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
  const result = await triggerLoadTest(token, { orderCount: 50, strategy: "LIMIT" });

  assertExists(result.jobId, "jobId must be present");
  assertEquals(result.submitted, 50, `Expected 50 submitted, got ${result.submitted}`);
  assert(result.symbols.length > 0, "symbols array must be non-empty");
  assertEquals(result.strategy, "LIMIT");
});

Deno.test("[load] orderCount is capped at 500", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, { orderCount: 9999, strategy: "LIMIT" });

  assertEquals(result.submitted, 500, `Expected submitted to be capped at 500, got ${result.submitted}`);
});

// ── Pipeline throughput ────────────────────────────────────────────────────────

Deno.test("[load] 100-order burst: all orders appear in journal within 30s", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, { orderCount: 100, strategy: "LIMIT" });

  const jobId = result.jobId;
  const deadline = Date.now() + 30_000;
  let seenCount = 0;

  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: {
          kind: "group", id: "root", join: "AND",
          rules: [{
            kind: "rule", id: "r1", field: "clientOrderId",
            op: "contains", value: jobId,
          }],
        },
        sortField: null, sortDir: null, offset: 0, limit: 200,
      }),
      signal: t(20_000),
    });
    if (res.ok) {
      const data = await res.json() as { rows: unknown[]; total: number };
      seenCount = data.total;
      if (seenCount >= 100) break;
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  assert(
    seenCount >= 90,
    `Expected ≥90/100 orders in journal within 30s, got ${seenCount}`,
  );
});

Deno.test("[load] 100-order burst: observability receives orders.submitted events", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, {
    orderCount: 100,
    strategy: "LIMIT",
    symbols: ["AAPL", "MSFT"],
  });

  const jobId = result.jobId;
  const deadline = Date.now() + 30_000;
  let matchCount = 0;

  while (Date.now() < deadline) {
    const res = await fetch(`${OBS_URL}/events?type=orders.submitted`, { signal: t(10_000) });
    if (res.ok) {
      const events = await res.json() as Array<{ payload: Record<string, unknown> }>;
      matchCount = events.filter(
        (e) => typeof e.payload?.clientOrderId === "string" &&
               (e.payload.clientOrderId as string).startsWith(jobId),
      ).length;
      if (matchCount >= 50) break;
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  assert(
    matchCount >= 50,
    `Expected ≥50 orders.submitted events for job ${jobId}, got ${matchCount}`,
  );
});

// ── Fill throughput ────────────────────────────────────────────────────────────

Deno.test("[load] 50 LIMIT orders: ≥80% fill rate within 60s", async () => {
  const token = await loginAsAdmin();
  const result = await triggerLoadTest(token, { orderCount: 50, strategy: "LIMIT" });

  const jobId = result.jobId;
  const deadline = Date.now() + 60_000;
  let filledCount = 0;

  while (Date.now() < deadline) {
    const res = await fetch(`${JOURNAL_URL}/grid/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gridId: "orderBlotter",
        filterExpr: {
          kind: "group", id: "root", join: "AND",
          rules: [
            { kind: "rule", id: "r1", field: "clientOrderId", op: "contains", value: jobId },
            { kind: "rule", id: "r2", field: "status", op: "=", value: "filled" },
          ],
        },
        sortField: null, sortDir: null, offset: 0, limit: 200,
      }),
      signal: t(20_000),
    });
    if (res.ok) {
      const data = await res.json() as { total: number };
      filledCount = data.total;
      if (filledCount >= 40) break;
    } else {
      await res.body?.cancel();
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }

  const fillRate = filledCount / 50;
  assert(
    fillRate >= 0.8,
    `Fill rate ${(fillRate * 100).toFixed(1)}% below 80% threshold (${filledCount}/50 filled within 60s)`,
  );
});

// ── FIX archive under load ────────────────────────────────────────────────────

Deno.test("[load] FIX archive grows after load injection", async () => {
  const beforeRes = await fetch(`${ARCHIVE_URL}/health`, { signal: t() });
  const before = (await beforeRes.json() as { executions: number }).executions;

  const token = await loginAsAdmin();
  await triggerLoadTest(token, { orderCount: 20, strategy: "LIMIT" });

  const deadline = Date.now() + 30_000;
  let after = before;
  while (Date.now() < deadline) {
    const res = await fetch(`${ARCHIVE_URL}/health`, { signal: t() });
    const body = await res.json() as { executions: number };
    after = body.executions;
    if (after > before) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }

  assert(after > before, `FIX archive execution count did not increase: before=${before}, after=${after}`);
});

// ── System stability after load ───────────────────────────────────────────────

Deno.test("[load] all services remain healthy after 100-order burst", async () => {
  const token = await loginAsAdmin();
  await triggerLoadTest(token, { orderCount: 100, strategy: "LIMIT" });

  await new Promise((r) => setTimeout(r, 5_000));

  const services = [
    { name: "gateway",   url: GATEWAY_URL },
    { name: "journal",   url: JOURNAL_URL },
    { name: "obs",       url: OBS_URL     },
    { name: "archive",   url: ARCHIVE_URL },
  ];

  for (const svc of services) {
    const res = await fetch(`${svc.url}/health`, { signal: t() });
    assertEquals(res.status, 200, `${svc.name} /health returned ${res.status} after load`);
    const body = await res.json() as { status: string };
    assertEquals(body.status, "ok", `${svc.name} reported non-ok status after load`);
  }
});
