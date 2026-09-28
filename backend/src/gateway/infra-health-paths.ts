/**
 * Redpanda's admin API, Ollama's API, Grafana's HTTP API and Prometheus's API
 * are broad control surfaces. For each of them the gateway maps the caller's
 * /health onto the one read-only health endpoint the service exposes, rather
 * than forwarding a path the service does not serve.
 */
const PINNED_HEALTH_PATHS: ReadonlyMap<string, string> = new Map([
  ["redpanda", "/v1/cluster/health_overview"],
  ["ollama", "/api/version"],
  ["grafana", "/grafana/api/health"],
  ["prometheus", "/-/healthy"],
]);

export function resolveInfraHealthPath(svcName: string, svcPath: string): string {
  if (svcPath !== "/health") return svcPath;
  return PINNED_HEALTH_PATHS.get(svcName) ?? svcPath;
}
