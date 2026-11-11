#!/usr/bin/env node
// VETA synthetic probe.
//
// Runs end-to-end checks against the public site to detect user-visible
// outages within ~60s. Designed to run on the OVH edge box as a systemd
// timer so it crosses the same SSH tunnel real users do, if the tunnel
// dies, the probe reports failure even though the homelab itself is fine.
//
// Each invocation runs all steps, emits one JSON line per step to stdout
// (captured by journald), and exits 0 if all green, 1 if any failed.
// systemd doesn't restart on exit 1, failure state is computed downstream
// by counting consecutive non-zero exits via the OnFailure handler or a
// Loki query.
//
// Steps:
//   1. GET /                           → 200, body contains "__version"
//   2. POST /api/gateway/api/user-service/oauth/guest → 200, sets veta_user
//   3. GET  /api/gateway/ready  (with cookie) → 200, ready:true
//   4. GET  /api/gateway/api/user-service/personas → 200, non-empty list
//   5. WS   /ws/gateway → a marketUpdate frame arrives within the timeout
//   6. WS   /ws/gateway → authenticate, submit order, observe terminal orderEvent
//
// Steps 4 and 5 were added after the 2026-05-28 outage, which surfaced
// as "Failed to load personas" (a user-service/DB stall returning 502)
// and "Feed disconnected" (no market frames) while the root GET and
// /ready still passed.

const BASE_URL = process.env.PROBE_BASE_URL ?? "https://veta.mnetcs.com";
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS) || 10_000;

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
  console.log(
    JSON.stringify({
      service: "synthetic-probe",
      ts: new Date().toISOString(),
      ...record,
    })
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
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
    const res = await withTimeout(fetch(`${BASE_URL}/`), TIMEOUT_MS, name);
    const body = await res.text();
    if (res.status !== 200) {
      return {
        step: 1,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        status: res.status,
        error: `expected 200, got ${res.status}`,
      };
    }
    if (!body.includes("__version") && !body.includes("VETA")) {
      return {
        step: 1,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        status: 200,
        error: "body did not include expected markers",
      };
    }
    return { step: 1, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 };
  } catch (err) {
    return {
      step: 1,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function step2GuestLogin(): Promise<{ result: StepResult; cookie: string | null }> {
  const t0 = nowMs();
  const name = "guest_login";
  try {
    const res = await withTimeout(
      fetch(`${BASE_URL}/api/gateway/api/user-service/oauth/guest`, { method: "POST" }),
      TIMEOUT_MS,
      name
    );
    // Drain the body so the connection can be released.
    await res.text();
    if (res.status === 403) {
      return {
        result: {
          step: 2,
          name,
          outcome: "fail",
          durationMs: nowMs() - t0,
          status: 403,
          error: "guest mode disabled (PUBLIC_GUEST_TRADING=false?)",
        },
        cookie: null,
      };
    }
    if (res.status !== 200) {
      return {
        result: {
          step: 2,
          name,
          outcome: "fail",
          durationMs: nowMs() - t0,
          status: res.status,
          error: `expected 200, got ${res.status}`,
        },
        cookie: null,
      };
    }
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/veta_user=([^;]+)/);
    if (!match) {
      return {
        result: {
          step: 2,
          name,
          outcome: "fail",
          durationMs: nowMs() - t0,
          status: 200,
          error: "no veta_user cookie in response",
        },
        cookie: null,
      };
    }
    return {
      result: { step: 2, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 },
      cookie: `veta_user=${match[1]}`,
    };
  } catch (err) {
    return {
      result: {
        step: 2,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        error: err instanceof Error ? err.message : String(err),
      },
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
      fetch(`${BASE_URL}/api/gateway/ready`, { headers }),
      TIMEOUT_MS,
      name
    );
    const body = await res.text();
    if (res.status !== 200) {
      return {
        step: 3,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        status: res.status,
        error: `expected 200, got ${res.status}`,
      };
    }
    try {
      const parsed = JSON.parse(body) as { ready?: boolean };
      if (parsed.ready !== true) {
        return {
          step: 3,
          name,
          outcome: "fail",
          durationMs: nowMs() - t0,
          status: 200,
          error: `ready=${parsed.ready}`,
        };
      }
    } catch {
      return {
        step: 3,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        status: 200,
        error: "non-JSON body",
      };
    }
    return { step: 3, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 };
  } catch (err) {
    return {
      step: 3,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function step4Personas(cookie: string | null): Promise<StepResult> {
  const t0 = nowMs();
  const name = "personas";
  try {
    const headers: HeadersInit = cookie ? { Cookie: cookie } : {};
    const res = await withTimeout(
      fetch(`${BASE_URL}/api/gateway/api/user-service/personas`, { headers }),
      TIMEOUT_MS,
      name
    );
    const body = await res.text();
    if (res.status !== 200) {
      return {
        step: 4,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        status: res.status,
        error: `expected 200, got ${res.status}`,
      };
    }
    try {
      const parsed = JSON.parse(body) as { personas?: unknown[] };
      if (!Array.isArray(parsed.personas) || parsed.personas.length === 0) {
        return {
          step: 4,
          name,
          outcome: "fail",
          durationMs: nowMs() - t0,
          status: 200,
          error: "personas list empty or missing",
        };
      }
    } catch {
      return {
        step: 4,
        name,
        outcome: "fail",
        durationMs: nowMs() - t0,
        status: 200,
        error: "non-JSON body",
      };
    }
    return { step: 4, name, outcome: "ok", durationMs: nowMs() - t0, status: 200 };
  } catch (err) {
    return {
      step: 4,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function step5MarketFeed(): Promise<StepResult> {
  const t0 = nowMs();
  const name = "market_feed";
  const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ws/gateway`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    return {
      step: 5,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`no marketUpdate frame within ${TIMEOUT_MS}ms (feed disconnected?)`));
      }, TIMEOUT_MS);
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data as string) as { event?: string };
          if (parsed.event === "marketUpdate") {
            clearTimeout(timer);
            resolve();
          }
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket error"));
      };
    });
    return { step: 5, name, outcome: "ok", durationMs: nowMs() - t0 };
  } catch (err) {
    return {
      step: 5,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      ws.close();
    } catch {
      // already closed
    }
  }
}

async function step6OrderJourney(cookie: string | null): Promise<StepResult> {
  const t0 = nowMs();
  const name = "order_journey";
  if (!cookie) {
    return {
      step: 6,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: "missing session cookie from guest login",
    };
  }
  const tokenMatch = cookie.match(/^veta_user=(.+)$/);
  const token = tokenMatch ? tokenMatch[1] : null;
  if (!token) {
    return {
      step: 6,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: "guest cookie did not contain a token",
    };
  }

  const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ws/gateway`;
  const clientOrderId = `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    return {
      step: 6,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutMs = Math.max(TIMEOUT_MS, 20_000);
      const timer = setTimeout(() => {
        reject(new Error(`order lifecycle not observed within ${timeoutMs}ms`));
      }, timeoutMs);
      let submitted = false;
      let acked = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "authenticate", payload: { token } }));
      };
      ws.onmessage = (ev) => {
        let parsed: { event?: string; topic?: string; data?: Record<string, unknown> };
        try {
          parsed = JSON.parse(ev.data as string) as {
            event?: string;
            topic?: string;
            data?: Record<string, unknown>;
          };
        } catch {
          return;
        }

        if (parsed.event === "authError") {
          clearTimeout(timer);
          reject(new Error("gateway rejected websocket authentication"));
          return;
        }

        if (parsed.event === "authIdentity" && !submitted) {
          submitted = true;
          ws.send(
            JSON.stringify({
              type: "submitOrder",
              payload: {
                clientOrderId,
                asset: "AAPL",
                side: "BUY",
                quantity: 1,
                limitPrice: 200,
                expiresAt: 60,
                strategy: "LIMIT",
                instrumentType: "equity",
                algoParams: { strategy: "LIMIT" },
              },
            })
          );
          return;
        }

        if (parsed.event === "orderAck") {
          const ackId = String(parsed.data?.clientOrderId ?? "");
          if (ackId === clientOrderId) acked = true;
          return;
        }

        if (parsed.event === "orderRejected") {
          const rejectId = String(parsed.data?.clientOrderId ?? "");
          if (rejectId === clientOrderId) {
            clearTimeout(timer);
            reject(new Error(`order rejected: ${String(parsed.data?.reason ?? "unknown")}`));
          }
          return;
        }

        if (parsed.event === "orderEvent") {
          const eventClientOrderId = String(parsed.data?.clientOrderId ?? "");
          if (eventClientOrderId !== clientOrderId) return;
          const topic = String(parsed.topic ?? "");
          if (!acked && topic !== "orders.rejected") return;
          if (
            topic === "orders.filled" ||
            topic === "orders.rejected" ||
            topic === "orders.expired" ||
            topic === "orders.cancelled"
          ) {
            clearTimeout(timer);
            resolve();
          }
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket error while probing order journey"));
      };
    });
    return { step: 6, name, outcome: "ok", durationMs: nowMs() - t0 };
  } catch (err) {
    return {
      step: 6,
      name,
      outcome: "fail",
      durationMs: nowMs() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      ws.close();
    } catch {
      // already closed
    }
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
    process.exit(1);
  }

  const { result: r2, cookie } = await step2GuestLogin();
  results.push(r2);
  emit({ event: "step", ...r2 });
  if (r2.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 2, totalMs: nowMs() - runStart });
    process.exit(1);
  }

  const r3 = await step3GatewayReady(cookie);
  results.push(r3);
  emit({ event: "step", ...r3 });
  if (r3.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 3, totalMs: nowMs() - runStart });
    process.exit(1);
  }

  const r4 = await step4Personas(cookie);
  results.push(r4);
  emit({ event: "step", ...r4 });
  if (r4.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 4, totalMs: nowMs() - runStart });
    process.exit(1);
  }

  const r5 = await step5MarketFeed();
  results.push(r5);
  emit({ event: "step", ...r5 });
  if (r5.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 5, totalMs: nowMs() - runStart });
    process.exit(1);
  }

  const r6 = await step6OrderJourney(cookie);
  results.push(r6);
  emit({ event: "step", ...r6 });
  if (r6.outcome === "fail") {
    emit({ event: "probe_done", outcome: "fail", failedAtStep: 6, totalMs: nowMs() - runStart });
    process.exit(1);
  }

  emit({ event: "probe_done", outcome: "ok", totalMs: nowMs() - runStart });
}

if (import.meta.main) {
  await main();
}

export {
  step1Root,
  step2GuestLogin,
  step3GatewayReady,
  step4Personas,
  step5MarketFeed,
  step6OrderJourney,
};
