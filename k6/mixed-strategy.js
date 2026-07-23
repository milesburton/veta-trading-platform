import { check } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://gateway:5011";
const TOKEN = __ENV.K6_TOKEN || "";
const RUN_LABEL = __ENV.RUN_LABEL || "mixed-strategy";
const ORDER_COUNT = Math.max(1, Number(__ENV.ORDER_COUNT || "1"));

const submitDuration = new Trend("veta_loadtest_submit_duration_ms", true);
const submitOk = new Rate("veta_loadtest_submit_ok");
const perStrategyOk = new Rate("veta_loadtest_strategy_ok");

const STRATEGIES = [
  { name: "LIMIT", weight: 30 },
  { name: "TWAP", weight: 20 },
  { name: "VWAP", weight: 15 },
  { name: "POV", weight: 12 },
  { name: "ICEBERG", weight: 8 },
  { name: "SNIPER", weight: 5 },
  { name: "ARRIVAL_PRICE", weight: 5 },
  { name: "MOMENTUM", weight: 3 },
  { name: "IS", weight: 2 },
];

const TOTAL_WEIGHT = STRATEGIES.reduce((s, x) => s + x.weight, 0);

function pickStrategy() {
  const roll = Math.random() * TOTAL_WEIGHT;
  let cum = 0;
  for (const s of STRATEGIES) {
    cum += s.weight;
    if (roll <= cum) return s.name;
  }
  return STRATEGIES[0].name;
}

export const options = {
  scenarios: {
    mixed: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "1m", target: 20 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    veta_loadtest_submit_ok: ["rate>0.95"],
    "http_req_duration{status:202}": ["p(99)<800"],
  },
};

export function setup() {
  if (!TOKEN) {
    throw new Error("K6_TOKEN env var is required (admin OAuth access token).");
  }
  return { token: TOKEN };
}

export default function (data) {
  const strategy = pickStrategy();
  const t0 = Date.now();
  const res = http.post(
    `${BASE_URL}/load-test`,
    JSON.stringify({ orderCount: ORDER_COUNT, strategy }),
    {
    headers: {
      "Content-Type": "application/json",
      Cookie: `veta_user=${data.token}`,
    },
    tags: { endpoint: "load-test", strategy },
    }
  );
  submitDuration.add(Date.now() - t0, { strategy });
  const ok = check(res, { "submit accepted (202)": (r) => r.status === 202 });
  submitOk.add(ok);
  perStrategyOk.add(ok, { strategy });
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
    orderCountPerRequest: ORDER_COUNT,
    iterations: data.metrics.iterations?.values?.count ?? 0,
    successRate: round(data.metrics.veta_loadtest_submit_ok?.values?.rate ?? 0),
    failureRate: round(1 - (data.metrics.veta_loadtest_submit_ok?.values?.rate ?? 0)),
    httpReqs: data.metrics.http_reqs?.values?.count ?? 0,
    strategyMix: STRATEGIES.map((s) => ({ strategy: s.name, weight: s.weight })),
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
