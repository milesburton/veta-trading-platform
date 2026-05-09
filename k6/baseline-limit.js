import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://gateway:5011";
const TOKEN = __ENV.K6_TOKEN || "";
const RUN_LABEL = __ENV.RUN_LABEL || "baseline-limit";

const submitDuration = new Trend("veta_loadtest_submit_duration_ms", true);
const submitOk = new Rate("veta_loadtest_submit_ok");

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "30s", target: 10 },
        { duration: "30s", target: 25 },
        { duration: "30s", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    veta_loadtest_submit_ok: ["rate>0.95"],
    "http_req_duration{status:202}": ["p(99)<500"],
  },
};

export function setup() {
  if (!TOKEN) {
    throw new Error(
      "K6_TOKEN env var is required. Obtain via:\n" +
        "  curl -X POST http://localhost:5008/oauth/authorize -H 'Content-Type: application/json' \\\n" +
        "    -d '{\"client_id\":\"veta-automation\",\"username\":\"admin\",\"password\":\"veta-dev-passcode\"," +
        "\"redirect_uri\":\"postmessage\",\"response_type\":\"code\",\"scope\":\"openid profile\"," +
        "\"code_challenge\":\"...\",\"code_challenge_method\":\"S256\"}'\n" +
        "Then exchange the code at /oauth/token to get the access token.",
    );
  }
  return { token: TOKEN };
}

export default function (data) {
  const t0 = Date.now();
  const res = http.post(
    `${BASE_URL}/load-test`,
    JSON.stringify({ orderCount: 1, strategy: "LIMIT" }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: `veta_user=${data.token}`,
      },
      tags: { endpoint: "load-test" },
    },
  );
  submitDuration.add(Date.now() - t0);
  submitOk.add(res.status === 202);
  check(res, {
    "status is 202": (r) => r.status === 202,
    "body has jobId": (r) => {
      try {
        return JSON.parse(r.body).jobId !== undefined;
      } catch {
        return false;
      }
    },
  });
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
    runStartedAt: new Date(Date.now()).toISOString(),
    target: BASE_URL,
    iterations: data.metrics.iterations?.values?.count ?? 0,
    successRate: round(data.metrics.veta_loadtest_submit_ok?.values?.rate ?? 0),
    failureRate: round(1 - (data.metrics.veta_loadtest_submit_ok?.values?.rate ?? 0)),
    httpReqs: data.metrics.http_reqs?.values?.count ?? 0,
    stages: {
      submitDurationMs: pickStage(data.metrics, "veta_loadtest_submit_duration_ms"),
      httpReqDurationMs: pickStage(data.metrics, "http_req_duration"),
    },
    thresholdsBreached: Object.entries(data.metrics)
      .filter(([_, m]) => m.thresholds && Object.values(m.thresholds).some((t) => t.ok === false))
      .map(([name]) => name),
  };

  const csvRows = [
    ["metric", "p50_ms", "p95_ms", "p99_ms", "max_ms", "count"].join(","),
    `submitDurationMs,${summary.stages.submitDurationMs?.p50 ?? ""},${summary.stages.submitDurationMs?.p95 ?? ""},${summary.stages.submitDurationMs?.p99 ?? ""},${summary.stages.submitDurationMs?.max ?? ""},${summary.stages.submitDurationMs?.count ?? ""}`,
    `httpReqDurationMs,${summary.stages.httpReqDurationMs?.p50 ?? ""},${summary.stages.httpReqDurationMs?.p95 ?? ""},${summary.stages.httpReqDurationMs?.p99 ?? ""},${summary.stages.httpReqDurationMs?.max ?? ""},${summary.stages.httpReqDurationMs?.count ?? ""}`,
  ].join("\n");

  return {
    stdout: JSON.stringify(summary, null, 2) + "\n",
    [`/output/${date}-${RUN_LABEL}.json`]: JSON.stringify(summary, null, 2),
    [`/output/${date}-${RUN_LABEL}.csv`]: csvRows,
  };
}
