import type { ServiceSpec } from "./serviceRegistry.ts";

export type ServiceStatus = "ok" | "starting" | "degraded" | "standby" | "error";

export type ProbeResult =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "http"; status: number; body: Record<string, unknown> }
  | { kind: "timeout" }
  | { kind: "unreachable" };

export type ServiceStatusCounts = Record<ServiceStatus, number> & { total: number };

export function canStandBy(spec: Pick<ServiceSpec, "tier" | "optional">): boolean {
  return spec.tier >= 1 || spec.optional === true;
}

export function classifyProbe(
  spec: Pick<ServiceSpec, "tier" | "optional">,
  probe: ProbeResult
): ServiceStatus {
  if (probe.kind === "ok") {
    return probe.body.is_healthy === false || probe.body.status === "warn" ? "degraded" : "ok";
  }
  if (probe.kind === "http" && probe.status === 503 && probe.body.status === "starting") {
    return "starting";
  }
  if (probe.kind === "http" && probe.status === 503 && probe.body.status === "critical") {
    return "degraded";
  }
  if (!canStandBy(spec)) return "error";
  return probe.kind === "unreachable" ? "standby" : "degraded";
}

export function isServiceUp(status: ServiceStatus): boolean {
  return status === "ok" || status === "standby";
}

export function countStatuses(statuses: readonly ServiceStatus[]): ServiceStatusCounts {
  return statuses.reduce<ServiceStatusCounts>(
    (acc, s) => ({ ...acc, [s]: acc[s] + 1, total: acc.total + 1 }),
    { ok: 0, starting: 0, degraded: 0, standby: 0, error: 0, total: 0 }
  );
}
