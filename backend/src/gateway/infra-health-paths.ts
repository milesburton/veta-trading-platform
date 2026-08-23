const REDPANDA_HEALTH_PATH = "/v1/cluster/health_overview";
const OLLAMA_HEALTH_PATH = "/api/version";

/**
 * Redpanda's admin API and Ollama's API are broad control surfaces (cluster
 * config / partition management; model pull / generation) — the gateway
 * only ever proxies their single read-only health path, pinned here rather
 * than passing the caller's requested path straight through.
 */
export function resolveInfraHealthPath(svcName: string, svcPath: string): string {
  if (svcName === "redpanda" && svcPath === "/health") return REDPANDA_HEALTH_PATH;
  if (svcName === "ollama" && svcPath === "/health") return OLLAMA_HEALTH_PATH;
  return svcPath;
}
