import { check } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://gateway:5011";
const TOKEN = __ENV.K6_TOKEN || "";
const RUN_LABEL = __ENV.RUN_LABEL || "soak";
const DURATION = __ENV.SOAK_DURATION || "30m";
const TARGET_VUS = Number(__ENV.SOAK_VUS || 25);

const submitDuration = new Trend("veta_loadtest_submit_duration_ms", true);
const submitOk = new Rate("veta_loadtest_submit_ok");

const STRATEGIES = ["LIMIT", "TWAP", "VWAP", "POV"];

export const options = {
  scenarios: {
    soak: {
      executor: "constant-vus",
      vus: TARGET_VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    veta_loadtest_submit_ok: ["rate>0.99"],
    "http_req_duration{status:202}": ["p(99)<1000"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  if (!TOKEN) throw new Error("K6_TOKEN env var is required.");
  return { token: TOKEN };
}

export default function (data) {
  const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
  const t0 = Date.now();
  const res = http.post(`${BASE_URL}/load-test`, JSON.stringify({ orderCount: 1, strategy }), {
    headers: {
      "Content-Type": "application/json",
      Cookie: `veta_user=${data.token}`,
    },
    tags: { endpoint: "load-test", strategy },
  });
  submitDuration.add(Date.now() - t0);
  submitOk.add(check(res, { "submit accepted (202)": (r) => r.status === 202 }));
}

function pickStage(metrics, name) {
  const m = metrics[name];
  if (!m || !m.values) return null;
  const v = m.values;
  return {
    count: v.count ?? 0,
    p50: round(v["p(50)"] ?? v.med ?? 0),
    p95: round(v["p(95)"] ?? 0),
    p99: round(v["p(99)"] ?? 0),
    max: round(v.max ?? 0),
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

export function handleSummary(data) {
  const date = new Date().toISOString().slice(0, 10);
  const summary = {
    runLabel: RUN_LABEL,
    runDate: date,
    runDuration: DURATION,
    runTargetVus: TARGET_VUS,
    target: BASE_URL,
    iterations: data.metrics.iterations?.values?.count ?? 0,
    successRate: round(data.metrics.veta_loadtest_submit_ok?.values?.rate ?? 0),
    failureRate: round(1 - (data.metrics.veta_loadtest_submit_ok?.values?.rate ?? 0)),
    httpFailureRate: round(data.metrics.http_req_failed?.values?.rate ?? 0),
    stages: {
      submitDurationMs: pickStage(data.metrics, "veta_loadtest_submit_duration_ms"),
      httpReqDurationMs: pickStage(data.metrics, "http_req_duration"),
    },
    thresholdsBreached: Object.entries(data.metrics)
      .filter(([_, m]) => m.thresholds && Object.values(m.thresholds).some((t) => t.ok === false))
      .map(([name]) => name),
  };

  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    [`/output/${date}-${RUN_LABEL}.json`]: JSON.stringify(summary, null, 2),
  };
}
