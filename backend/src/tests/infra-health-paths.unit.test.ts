import { assertEquals } from "jsr:@std/assert@0.217";
import { resolveInfraHealthPath } from "../gateway/infra-health-paths.ts";

Deno.test("[infra-health-paths] pins redpanda's /health to the admin API's cluster health_overview", () => {
  assertEquals(resolveInfraHealthPath("redpanda", "/health"), "/v1/cluster/health_overview");
});

Deno.test("[infra-health-paths] pins ollama's /health to /api/version", () => {
  assertEquals(resolveInfraHealthPath("ollama", "/health"), "/api/version");
});

Deno.test("[infra-health-paths] leaves other services' paths untouched", () => {
  assertEquals(resolveInfraHealthPath("market-sim", "/health"), "/health");
  assertEquals(resolveInfraHealthPath("postgres-health", "/health"), "/health");
});

Deno.test("[infra-health-paths] leaves non-/health paths on redpanda/ollama untouched", () => {
  assertEquals(resolveInfraHealthPath("redpanda", "/topics"), "/topics");
  assertEquals(resolveInfraHealthPath("ollama", "/api/generate"), "/api/generate");
});
