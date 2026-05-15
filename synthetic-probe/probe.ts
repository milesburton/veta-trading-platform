#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
// VETA synthetic probe.
//
// Runs end-to-end checks against the public site to detect user-visible
// outages within ~60s. Designed to run on the OVH edge box as a systemd
// timer so it crosses the same SSH tunnel real users do — if the tunnel
// dies, the probe reports failure even though the homelab itself is fine.
//
// Each invocation runs all steps, emits one JSON line per step to stdout
// (captured by journald), and exits 0 if all green, 1 if any failed.
// systemd doesn't restart on exit 1 — failure state is computed downstream
// by counting consecutive non-zero exits via the OnFailure handler or a
// Loki query.
//
// Steps in v1 — HTTP only, no WS, no order placement:
//   1. GET /                           → 200, body contains "__version"
//   2. POST /api/gateway/api/user-service/oauth/guest → 200, sets veta_user
//   3. GET  /api/gateway/ready  (with cookie) → 200, ready:true
//
// Future v2 additions, when v1 is reliable: WS market-frame count, order
// submit + cancel via the guest session.

const BASE_URL = Deno.env.get("PROBE_BASE_URL") ?? "https://veta.mnetcs.com";
const TIMEOUT_MS = Number(Deno.env.get("PROBE_TIMEOUT_MS")) || 10_000;

interface StepResult {
  step: number;
  name: string;
  outcome: "ok" | "fail";
  durationMs: number;
  status?: number;
  error?: string;
}

function nowMs(): number {
  return performance.now();
}

function emit(record: Record<string, unknown>): void {
  console.log(JSON.stringify({
    service: "synthetic-probe",
    ts: new Date().toISOString(),
    ...record,
  }));
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function step1Root(): Promise<StepResult> {
  const t0 = nowMs();
  const name = "root";
  try {
    const res = await withTimeout(fetch(BASE_URL + "/"), TIMEOUT_MS, name);
    const body = await res.text();
    if (res.status !== 200) {
      return { step: 1, name, outcome: "fail", durationMs: nowMs() - t0, status: res.status, error: `expected 200, got ${res.status}` };
    }
    if (!body.includes("__version") && !body.includes("VETA")) {
      return { step: 1, name, outcome: "fail", durationMs: nowMs() - t0, status: 200, error: "body did not include expected markers" };
    }
    return { step: 1, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 };
  } catch (err) {
    return { step: 1, name, outcome: "fail", durationMs: nowMs() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function step2GuestLogin(): Promise<{ result: StepResult; cookie: string | null }> {
  const t0 = nowMs();
  const name = "guest_login";
  try {
    const res = await withTimeout(
      fetch(BASE_URL + "/api/gateway/api/user-service/oauth/guest", { method: "POST" }),
      TIMEOUT_MS,
      name,
    );
    // Drain the body so the connection can be released.
    await res.text();
    if (res.status === 403) {
      return {
        result: { step: 2, name, outcome: "fail", durationMs: nowMs() - t0, status: 403, error: "guest mode disabled (PUBLIC_GUEST_TRADING=false?)" },
        cookie: null,
      };
    }
    if (res.status !== 200) {
      return {
        result: { step: 2, name, outcome: "fail", durationMs: nowMs() - t0, status: res.status, error: `expected 200, got ${res.status}` },
        cookie: null,
      };
    }
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/veta_user=([^;]+)/);
    if (!match) {
      return {
        result: { step: 2, name, outcome: "fail", durationMs: nowMs() - t0, status: 200, error: "no veta_user cookie in response" },
        cookie: null,
      };
    }
    return {
      result: { step: 2, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 },
      cookie: `veta_user=${match[1]}`,
    };
  } catch (err) {
    return {
      result: { step: 2, name, outcome: "fail", durationMs: nowMs() - t0, error: err instanceof Error ? err.message : String(err) },
      cookie: null,
    };
  }
}

async function step3GatewayReady(cookie: string | null): Promise<StepResult> {
  const t0 = nowMs();
  const name = "gateway_ready";
  try {
    const headers: HeadersInit = cookie ? { Cookie: cookie } : {};
    const res = await withTimeout(
      fetch(BASE_URL + "/api/gateway/ready", { headers }),
      TIMEOUT_MS,
      name,
    );
    const body = await res.text();
    if (res.status !== 200) {
      return { step: 3, name, outcome: "fail", durationMs: nowMs() - t0, status: res.status, error: `expected 200, got ${res.status}` };
    }
    try {
      const parsed = JSON.parse(body) as { ready?: boolean };
      if (parsed.ready !== true) {
        return { step: 3, name, outcome: "fail", durationMs: nowMs() - t0, status: 200, error: `ready=${parsed.ready}` };
      }
    } catch {
      return { step: 3, name, outcome: "fail", durationMs: nowMs() - t0, status: 200, error: "non-JSON body" };
    }
    return { step: 3, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 };
  } catch (err) {
    return { step: 3, name, outcome: "fail", durationMs: nowMs() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const runStart = nowMs();
  const results: StepResult[] = [];

  const r1 = await step1Root();
  results.push(r1);
  emit({ event: "step", ...r1 });
  if (r1.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 1, totalMs: nowMs() - runStart });
    Deno.exit(1);
  }

  const { result: r2, cookie } = await step2GuestLogin();
  results.push(r2);
  emit({ event: "step", ...r2 });
  if (r2.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 2, totalMs: nowMs() - runStart });
    Deno.exit(1);
  }

  const r3 = await step3GatewayReady(cookie);
  results.push(r3);
  emit({ event: "step", ...r3 });
  if (r3.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 3, totalMs: nowMs() - runStart });
    Deno.exit(1);
  }

  emit({ event: "probe_done", outcome: "ok", totalMs: nowMs() - runStart });
}

if (import.meta.main) {
  await main();
}

export { step1Root, step2GuestLogin, step3GatewayReady };
