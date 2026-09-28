import { assertEquals } from "jsr:@std/assert@0.217";
import { resolveInfraHealthPath } from "../gateway/infra-health-paths.ts";

Deno.test("[infra-health-paths] pins redpanda's /health to the admin API's cluster health_overview", () => {
  assertEquals(resolveInfraHealthPath("redpanda", "/health"), "/v1/cluster/health_overview");
});

Deno.test("[infra-health-paths] pins ollama's /health to /api/version", () => {
  assertEquals(resolveInfraHealthPath("ollama", "/health"), "/api/version");
});

Deno.test("[infra-health-paths] pins grafana's /health to /grafana/api/health", () => {
  assertEquals(resolveInfraHealthPath("grafana", "/health"), "/grafana/api/health");
});

Deno.test("[infra-health-paths] pins prometheus's /health to /-/healthy", () => {
  assertEquals(resolveInfraHealthPath("prometheus", "/health"), "/-/healthy");
});

Deno.test("[infra-health-paths] leaves other services' paths untouched", () => {
  assertEquals(resolveInfraHealthPath("market-sim", "/health"), "/health");
  assertEquals(resolveInfraHealthPath("postgres-health", "/health"), "/health");
  assertEquals(resolveInfraHealthPath("constructor", "/health"), "/health");
});

Deno.test("[infra-health-paths] leaves non-/health paths on pinned services untouched", () => {
  assertEquals(resolveInfraHealthPath("redpanda", "/topics"), "/topics");
  assertEquals(resolveInfraHealthPath("ollama", "/api/generate"), "/api/generate");
  assertEquals(resolveInfraHealthPath("grafana", "/api/dashboards"), "/api/dashboards");
  assertEquals(resolveInfraHealthPath("prometheus", "/api/v1/query"), "/api/v1/query");
});
