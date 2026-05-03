import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://gateway:5011";
const TOKEN = __ENV.K6_TOKEN || "";

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
