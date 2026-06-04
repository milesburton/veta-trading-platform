import { check } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://gateway:5011";
const TOKEN = __ENV.K6_TOKEN || "";
const RUN_LABEL = __ENV.RUN_LABEL || "risk-stress";

const submitDuration = new Trend("veta_loadtest_submit_duration_ms", true);
const submitOk = new Rate("veta_loadtest_submit_ok");
const acceptRate = new Rate("veta_loadtest_accept_rate");
const rejectRate = new Rate("veta_loadtest_reject_rate");

const PROFILES = [
  { label: "well-under", quantity: 100, weight: 50 },
  { label: "just-under", quantity: 9_500, weight: 30 },
  { label: "at-limit", quantity: 10_000, weight: 10 },
  { label: "over-limit", quantity: 10_001, weight: 8 },
  { label: "way-over", quantity: 50_000, weight: 2 },
];

const TOTAL_WEIGHT = PROFILES.reduce((s, x) => s + x.weight, 0);

function pickProfile() {
  const roll = Math.random() * TOTAL_WEIGHT;
  let cum = 0;
  for (const p of PROFILES) {
    cum += p.weight;
    if (roll <= cum) return p;
  }
  return PROFILES[0];
}

export const options = {
  scenarios: {
    risk_pressure: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m", target: 30 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    veta_loadtest_submit_ok: ["rate>0.95"],
    "http_req_duration{endpoint:load-test}": ["p(99)<1500"],
  },
};

export function setup() {
  if (!TOKEN) throw new Error("K6_TOKEN env var is required.");
  return { token: TOKEN };
}

export default function (data) {
  const profile = pickProfile();
  const t0 = Date.now();
  const res = http.post(
    `${BASE_URL}/load-test`,
    JSON.stringify({ orderCount: 1, strategy: "LIMIT", quantity: profile.quantity }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: `veta_user=${data.token}`,
      },
      tags: { endpoint: "load-test", profile: profile.label },
    }
  );
  submitDuration.add(Date.now() - t0, { profile: profile.label });
  const accepted = res.status === 202;
  const rejectedAtRisk = res.status === 200 || res.status === 422;
  submitOk.add(
    check(res, {
      "load-test endpoint responsive": (r) =>
        r.status === 202 || r.status === 200 || r.status === 422,
    })
  );
  acceptRate.add(accepted, { profile: profile.label });
  rejectRate.add(rejectedAtRisk, { profile: profile.label });
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
    target: BASE_URL,
    profileMix: PROFILES,
    iterations: data.metrics.iterations?.values?.count ?? 0,
    acceptRate: round(data.metrics.veta_loadtest_accept_rate?.values?.rate ?? 0),
    rejectRate: round(data.metrics.veta_loadtest_reject_rate?.values?.rate ?? 0),
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
