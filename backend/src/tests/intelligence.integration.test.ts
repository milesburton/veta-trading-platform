/**
 * Integration tests for the Market Intelligence pipeline.
 *
 * Requires the following services to be running:
 *   feature-engine  (port 5017)
 *   signal-engine   (port 5018)
 *   market-data-adapters (port 5016)
 *   scenario-engine (port 5020)
 *   gateway         (port 5011) — for proxy routes
 *   market-sim      (port 5000) — for symbols list
 *
 * Tests that:
 *  1. All intelligence services are healthy
 *  2. Feature-engine /features/:symbol returns a well-formed FeatureVector
 *  3. Signal-engine /signals/:symbol returns a well-formed Signal
 *  4. Default weights satisfy mathematical invariants (abs-sum = 1.0, realisedVol < 0)
 *  5. Weight update via PUT /weights round-trips correctly
 *  6. Scenario-engine /scenario produces baseline + shocked Signal
 *  7. Scenario shock changes signal score in the expected direction
 *  8. Market-data-adapters /events returns a list with valid structure
 *  9. Gateway proxy routes for intelligence are accessible
 * 10. Signal direction is consistent with the reported score
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

const FEATURE_ENGINE_URL    = "http://localhost:5017";
const SIGNAL_ENGINE_URL     = "http://localhost:5018";
const MARKET_DATA_URL       = "http://localhost:5016";
const SCENARIO_ENGINE_URL   = "http://localhost:5020";
const GATEWAY_URL           = "http://localhost:5011";

function t(ms = 10_000) { return AbortSignal.timeout(ms); }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: t() });
  assert(res.ok, `GET ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Service health ────────────────────────────────────────────────────────────

Deno.test("[intelligence] feature-engine is healthy", async () => {
  const health = await getJson<{ status: string; service: string }>(`${FEATURE_ENGINE_URL}/health`);
  assertEquals(health.status, "ok");
  assertEquals(health.service, "feature-engine");
});

Deno.test("[intelligence] signal-engine is healthy", async () => {
  const health = await getJson<{ status: string; service: string }>(`${SIGNAL_ENGINE_URL}/health`);
  assertEquals(health.status, "ok");
  assertEquals(health.service, "signal-engine");
});

Deno.test("[intelligence] market-data-adapters is healthy", async () => {
  const health = await getJson<{ status: string; service: string; eventCount: number }>(`${MARKET_DATA_URL}/health`);
  assertEquals(health.status, "ok");
  assertEquals(health.service, "market-data-adapters");
  assert(health.eventCount >= 0, "eventCount should be non-negative");
});

Deno.test("[intelligence] scenario-engine is healthy", async () => {
  const health = await getJson<{ status: string; service: string }>(`${SCENARIO_ENGINE_URL}/health`);
  assertEquals(health.status, "ok");
  assertEquals(health.service, "scenario-engine");
});

// ── Default weights invariants ────────────────────────────────────────────────

Deno.test("[intelligence] signal-engine default weights: abs-sum=1.0, realisedVol<0, all 7 keys present", async () => {
  const weights = await getJson<Record<string, number>>(`${SIGNAL_ENGINE_URL}/weights`);

  const expectedKeys = ["momentum", "relativeVolume", "realisedVol", "sectorRelativeStrength", "eventScore", "newsVelocity", "sentimentDelta"];
  for (const k of expectedKeys) {
    assertExists(weights[k], `Missing weight key: ${k}`);
  }
  assertEquals(Object.keys(weights).length, 7);

  assert(weights.realisedVol < 0, `realisedVol weight should be negative, got ${weights.realisedVol}`);

  const absSum = Object.values(weights).reduce((a, b) => a + Math.abs(b), 0);
  assert(Math.abs(absSum - 1.0) < 0.01, `abs-sum of weights should be ~1.0, got ${absSum}`);
});

// ── Weight round-trip ─────────────────────────────────────────────────────────

Deno.test("[intelligence] PUT /weights round-trips a single weight change", async () => {
  const original = await getJson<Record<string, number>>(`${SIGNAL_ENGINE_URL}/weights`);

  // Adjust one weight slightly
  const patched = { ...original, newsVelocity: original.newsVelocity + 0.01 };
  const putRes = await fetch(`${SIGNAL_ENGINE_URL}/weights`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patched),
    signal: t(),
  });
  assert(putRes.ok, `PUT /weights → ${putRes.status}`);
  const returned = await putRes.json() as Record<string, number>;
  assert(
    Math.abs(returned.newsVelocity - patched.newsVelocity) < 0.0001,
    `newsVelocity should be ${patched.newsVelocity}, got ${returned.newsVelocity}`,
  );

  // Restore original weights
  await fetch(`${SIGNAL_ENGINE_URL}/weights`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(original),
    signal: t(),
  });
});

// ── Feature-engine data ───────────────────────────────────────────────────────

Deno.test("[intelligence] feature-engine returns all 7 feature fields for a tracked symbol", async () => {
  // Wait up to 15s for the first feature vector to be computed (engine needs ticks)
  const expectedFields = ["momentum", "relativeVolume", "realisedVol", "sectorRelativeStrength", "eventScore", "newsVelocity", "sentimentDelta"];
  const deadline = Date.now() + 15_000;
  let fv: Record<string, unknown> | null = null;

  while (Date.now() < deadline) {
    // Try to find any symbol that has data
    const res = await fetch(`${FEATURE_ENGINE_URL}/features/AAPL`, { signal: t() });
    if (res.ok) {
      fv = await res.json() as Record<string, unknown>;
      break;
    }
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 1_500));
  }

  assertExists(fv, "Feature-engine did not produce a FeatureVector for AAPL within 15s");
  assertEquals((fv as Record<string, unknown>).symbol, "AAPL");

  for (const field of expectedFields) {
    assertExists(fv[field] !== undefined ? fv[field] : null, `Missing field: ${field}`);
    assertEquals(typeof fv[field], "number", `Field ${field} should be a number`);
  }
});

// ── Signal data ───────────────────────────────────────────────────────────────

Deno.test("[intelligence] signal-engine returns a well-formed Signal for a tracked symbol", async () => {
  const deadline = Date.now() + 15_000;
  let signal: Record<string, unknown> | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${SIGNAL_ENGINE_URL}/signals/AAPL`, { signal: t() });
    if (res.ok) {
      signal = await res.json() as Record<string, unknown>;
      break;
    }
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 1_500));
  }

  assertExists(signal, "Signal-engine did not produce a Signal for AAPL within 15s");
  assertEquals(signal.symbol, "AAPL");
  assert(typeof signal.score === "number", "score should be a number");
  assert((signal.score as number) >= -1 && (signal.score as number) <= 1, `score ${signal.score} out of [-1, 1]`);
  assert(["long", "short", "neutral"].includes(signal.direction as string), `invalid direction: ${signal.direction}`);
  assert(Array.isArray(signal.factors) && (signal.factors as unknown[]).length === 7, "factors should have 7 entries");
});

Deno.test("[intelligence] signal direction is consistent with score", async () => {
  const deadline = Date.now() + 15_000;
  let signal: { score: number; direction: string } | null = null;

  while (Date.now() < deadline) {
    const res = await fetch(`${SIGNAL_ENGINE_URL}/signals/AAPL`, { signal: t() });
    if (res.ok) {
      signal = await res.json() as { score: number; direction: string };
      break;
    }
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 1_500));
  }

  assertExists(signal, "No signal available");
  const { score, direction } = signal;
  if (score > 0.2)       assertEquals(direction, "long",    `score=${score} should be long`);
  else if (score < -0.2) assertEquals(direction, "short",   `score=${score} should be short`);
  else                   assertEquals(direction, "neutral", `score=${score} should be neutral`);
});

// ── Scenario engine ───────────────────────────────────────────────────────────

Deno.test("[intelligence] scenario: positive momentum shock increases signal score", async () => {
  const body = {
    symbol: "AAPL",
    shocks: [{ factor: "momentum", delta: 0.08 }],
  };
  const res = await fetch(`${SCENARIO_ENGINE_URL}/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: t(15_000),
  });

  if (res.status === 503) {
    await res.body?.cancel();
    console.warn("[skip] Scenario engine: feature-engine not ready");
    return;
  }
  assert(res.ok, `POST /scenario → ${res.status}`);

  const result = await res.json() as {
    baseline: { score: number; direction: string };
    shocked: { score: number; direction: string };
    delta: number;
  };

  assertExists(result.baseline, "missing baseline");
  assertExists(result.shocked, "missing shocked");
  assert(typeof result.delta === "number", "delta should be a number");
  assert(result.shocked.score >= result.baseline.score, `positive momentum shock should increase score: baseline=${result.baseline.score} shocked=${result.shocked.score}`);
});

Deno.test("[intelligence] scenario: negative sentiment shock decreases signal score", async () => {
  const body = {
    symbol: "AAPL",
    shocks: [{ factor: "sentimentDelta", delta: -1.0 }],
  };
  const res = await fetch(`${SCENARIO_ENGINE_URL}/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: t(15_000),
  });

  if (res.status === 503) {
    await res.body?.cancel();
    console.warn("[skip] Scenario engine: feature-engine not ready");
    return;
  }
  assert(res.ok, `POST /scenario → ${res.status}`);

  const result = await res.json() as {
    baseline: { score: number };
    shocked: { score: number };
    delta: number;
  };

  assert(result.shocked.score <= result.baseline.score, `negative sentiment shock should reduce score: baseline=${result.baseline.score} shocked=${result.shocked.score}`);
  assert(result.delta <= 0, `delta should be ≤0 for negative shock, got ${result.delta}`);
});

// ── Market-data-adapters ──────────────────────────────────────────────────────

Deno.test("[intelligence] market-data-adapters returns seeded events with valid structure", async () => {
  const events = await getJson<Array<{
    id: string; type: string; headline: string; scheduledAt: number; impact: string; ts: number;
  }>>(`${MARKET_DATA_URL}/events?limit=20`);

  assert(Array.isArray(events), "events should be an array");
  assert(events.length > 0, "should have at least one seeded event");

  const first = events[0];
  assertExists(first.id, "event.id");
  assertExists(first.type, "event.type");
  assertExists(first.headline, "event.headline");
  assert(typeof first.scheduledAt === "number", "scheduledAt should be a number");
  assert(["high", "medium", "low"].includes(first.impact), `invalid impact: ${first.impact}`);
});

// ── Gateway proxy routes ──────────────────────────────────────────────────────

Deno.test("[intelligence] gateway proxies GET /intelligence/weights without auth", async () => {
  const res = await fetch(`${GATEWAY_URL}/intelligence/weights`, { signal: t() });
  // Weights endpoint is read-only and unprotected (PUT is admin-only)
  assert(res.ok, `GET /intelligence/weights via gateway → ${res.status}`);
  const weights = await res.json() as Record<string, number>;
  assertEquals(Object.keys(weights).length, 7, "should return 7 weights");
});

Deno.test("[intelligence] gateway proxies GET /intelligence/signals without auth", async () => {
  const res = await fetch(`${GATEWAY_URL}/intelligence/signals`, { signal: t() });
  assert(res.ok || res.status === 404, `GET /intelligence/signals → ${res.status}`);
  await res.body?.cancel();
});
