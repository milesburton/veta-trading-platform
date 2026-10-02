import { assertEquals } from "jsr:@std/assert@0.217";
import { classifyProbe, countStatuses, type ProbeResult } from "../../../shared/serviceState.ts";

const REQUIRED = { tier: 0 as const };
const OPTIONAL_ALWAYS_ON = { tier: 0 as const, optional: true };
const ON_DEMAND = { tier: 1 as const };
const DEFAULT_OFF = { tier: 3 as const };

const OK: ProbeResult = { kind: "ok", body: {} };
const UNREACHABLE: ProbeResult = { kind: "unreachable" };
const TIMEOUT: ProbeResult = { kind: "timeout" };
const HTTP_500: ProbeResult = { kind: "http", status: 500, body: {} };

Deno.test("[classifyProbe] a healthy 200 is ok for every tier", () => {
  for (const spec of [REQUIRED, OPTIONAL_ALWAYS_ON, ON_DEMAND, DEFAULT_OFF]) {
    assertEquals(classifyProbe(spec, OK), "ok");
  }
});

Deno.test("[classifyProbe] a 200 whose body reports unhealthy or warn is degraded", () => {
  assertEquals(classifyProbe(REQUIRED, { kind: "ok", body: { is_healthy: false } }), "degraded");
  assertEquals(classifyProbe(REQUIRED, { kind: "ok", body: { status: "warn" } }), "degraded");
});

Deno.test("[classifyProbe] a 503 reporting starting or critical keeps its meaning on any tier", () => {
  const starting: ProbeResult = { kind: "http", status: 503, body: { status: "starting" } };
  const critical: ProbeResult = { kind: "http", status: 503, body: { status: "critical" } };
  assertEquals(classifyProbe(REQUIRED, starting), "starting");
  assertEquals(classifyProbe(ON_DEMAND, starting), "starting");
  assertEquals(classifyProbe(REQUIRED, critical), "degraded");
  assertEquals(classifyProbe(DEFAULT_OFF, critical), "degraded");
});

Deno.test("[classifyProbe] a required tier 0 service is error on any failure", () => {
  for (const probe of [UNREACHABLE, TIMEOUT, HTTP_500]) {
    assertEquals(classifyProbe(REQUIRED, probe), "error");
  }
});

Deno.test("[classifyProbe] an unreachable on-demand or optional service is standby", () => {
  for (const spec of [OPTIONAL_ALWAYS_ON, ON_DEMAND, DEFAULT_OFF]) {
    assertEquals(classifyProbe(spec, UNREACHABLE), "standby");
  }
});

Deno.test("[classifyProbe] a hung or failing on-demand or optional service is degraded", () => {
  for (const spec of [OPTIONAL_ALWAYS_ON, ON_DEMAND, DEFAULT_OFF]) {
    assertEquals(classifyProbe(spec, TIMEOUT), "degraded");
    assertEquals(classifyProbe(spec, HTTP_500), "degraded");
  }
});

Deno.test("[countStatuses] tallies each status and the total", () => {
  assertEquals(countStatuses(["ok", "ok", "standby", "error", "degraded", "starting"]), {
    ok: 2,
    starting: 1,
    degraded: 1,
    standby: 1,
    error: 1,
    total: 6,
  });
});
