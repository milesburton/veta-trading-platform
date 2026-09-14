import type { ServiceState } from "@veta/frontend/types.ts";

export type ServiceDisplayState = ServiceState | "asleep";

interface TieredServiceHealth {
  state: ServiceState;
  optional?: boolean;
  tier?: number;
}

// A tier >= 1 service reporting "error" is expected to be hibernating, not broken.
export function isHibernating(svc: TieredServiceHealth): boolean {
  return (svc.tier ?? 0) >= 1 && svc.state === "error";
}

export function deriveDisplayState(svc: TieredServiceHealth): ServiceDisplayState {
  if (isHibernating(svc)) return "asleep";
  return svc.state;
}

export function isExpectedAbsence(svc: TieredServiceHealth): boolean {
  return Boolean(svc.optional) || isHibernating(svc);
}
