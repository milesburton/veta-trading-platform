// fallow-ignore-file complexity

import { assert, assertEquals, assertExists } from "jsr:@std/assert@0.217";
import { login } from "./testcontainers/auth.ts";
import { startStack, type TestStack } from "./testcontainers/services.ts";

const SHOULD_RUN = Deno.env.get("RUN_TESTCONTAINERS") === "1";
const T = (ms = 10_000) => AbortSignal.timeout(ms);

function url(stack: TestStack, name: keyof TestStack["urls"]): string {
  const u = stack.urls[name];
  if (!u) throw new Error(`${name} URL not in stack`);
  return u;
}

async function getJson<R>(u: string, headers?: HeadersInit): Promise<R> {
  const res = await fetch(u, { headers, signal: T() });
  assert(res.ok, `GET ${u} → ${res.status}`);
  return res.json() as Promise<R>;
}

async function pollFor<R>(fetcher: () => Promise<Response>, deadlineMs: number): Promise<R | null> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const res = await fetcher();
    if (res.ok) return res.json() as Promise<R>;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

const SERVICES = [
  "market-sim",
  "user-service",
  "feature-engine",
  "signal-engine",
  "scenario-engine",
  "market-data-adapters",
  "journal",
  "gateway",
] as const;

Deno.test({
  name: "intelligence pipeline (testcontainers)",
  ignore: !SHOULD_RUN,
  async fn(t) {
    const stack = await startStack({
      services: [...SERVICES],
      startupTimeoutMs: 120_000,
    });
    const FE = url(stack, "feature-engine");
    const SE = url(stack, "signal-engine");
    const MA = url(stack, "market-data-adapters");
    const SC = url(stack, "scenario-engine");
    const GW = url(stack, "gateway");
    try {
      await t.step("feature-engine is healthy", async () => {
        const h = await getJson<{ status: string; service: string }>(`${FE}/health`);
        assertEquals(h.status, "ok");
        assertEquals(h.service, "feature-engine");
      });

      await t.step("signal-engine is healthy", async () => {
        const h = await getJson<{ status: string; service: string }>(`${SE}/health`);
        assertEquals(h.status, "ok");
        assertEquals(h.service, "signal-engine");
      });

      await t.step("market-data-adapters is healthy", async () => {
        const h = await getJson<{ status: string; service: string; eventCount: number }>(
          `${MA}/health`
        );
        assertEquals(h.status, "ok");
        assertEquals(h.service, "market-data-adapters");
      });

      await t.step("scenario-engine is healthy", async () => {
        const h = await getJson<{ status: string; service: string }>(`${SC}/health`);
        assertEquals(h.status, "ok");
        assertEquals(h.service, "scenario-engine");
      });

      await t.step("signal-engine default weights satisfy invariants", async () => {
        const w = await getJson<Record<string, number>>(`${SE}/weights`);
        const expected = [
          "momentum",
          "relativeVolume",
          "realisedVol",
          "sectorRelativeStrength",
          "eventScore",
          "newsVelocity",
          "sentimentDelta",
        ];
        for (const k of expected) assertExists(w[k]);
        assertEquals(Object.keys(w).length, 7);
        assert(w.realisedVol < 0);
        const absSum = Object.values(w).reduce((a, b) => a + Math.abs(b), 0);
        assert(Math.abs(absSum - 1.0) < 0.01);
      });

      await t.step("PUT /weights round-trips a single weight change", async () => {
        const original = await getJson<Record<string, number>>(`${SE}/weights`);
        const patched = {
          ...original,
          newsVelocity: original.newsVelocity + 0.01,
        };
        const putRes = await fetch(`${SE}/weights`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patched),
          signal: T(),
        });
        assert(putRes.ok);
        const returned = (await putRes.json()) as Record<string, number>;
        assert(Math.abs(returned.newsVelocity - patched.newsVelocity) < 0.0001);
        const restoreRes = await fetch(`${SE}/weights`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(original),
          signal: T(),
        });
        await restoreRes.body?.cancel();
      });

      await t.step("feature-engine returns all 7 fields for AAPL", async () => {
        const fv = await pollFor<Record<string, unknown>>(
          () => fetch(`${FE}/features/AAPL`, { signal: T() }),
          45_000
        );
        assertExists(fv, "Feature-engine did not produce a FeatureVector for AAPL within 45s");
        assertEquals(fv?.symbol, "AAPL");
        for (const f of [
          "momentum",
          "relativeVolume",
          "realisedVol",
          "sectorRelativeStrength",
          "eventScore",
          "newsVelocity",
          "sentimentDelta",
        ]) {
          assertEquals(typeof fv?.[f], "number", `Field ${f} should be a number`);
        }
      });

      await t.step("signal-engine returns a well-formed Signal for AAPL", async () => {
        const signal = await pollFor<Record<string, unknown>>(
          () => fetch(`${SE}/signals/AAPL`, { signal: T() }),
          45_000
        );
        assertExists(signal, "Signal-engine did not produce a Signal for AAPL within 45s");
        assertEquals(signal?.symbol, "AAPL");
        assert(typeof signal?.score === "number");
        const score = signal?.score as number;
        assert(score >= -1 && score <= 1);
        assert(["long", "short", "neutral"].includes(signal?.direction as string));
        assert(Array.isArray(signal?.factors) && (signal?.factors as unknown[]).length === 7);
      });

      await t.step("market-data-adapters returns seeded events", async () => {
        const events = await getJson<Array<{ id: string; type: string; impact: string }>>(
          `${MA}/events?limit=20`
        );
        assert(Array.isArray(events) && events.length > 0);
        const first = events[0];
        assertExists(first.id);
        assertExists(first.type);
        assert(["high", "medium", "low"].includes(first.impact));
      });

      await t.step("gateway proxies GET /intelligence/weights with auth", async () => {
        const token = await login(stack, "alice");
        const res = await fetch(`${GW}/intelligence/weights`, {
          headers: { cookie: `veta_user=${token}` },
          signal: T(),
        });
        assert(res.ok, `GET /intelligence/weights via gateway → ${res.status}`);
        const weights = (await res.json()) as Record<string, number>;
        assertEquals(Object.keys(weights).length, 7);
      });
    } finally {
      await stack.teardown();
    }
  },
});
