import type { ServiceState } from "@veta/frontend/types.ts";

export type ServiceDisplayState = ServiceState | "asleep";

interface TieredServiceHealth {
  state: ServiceState;
  optional?: boolean;
  tier?: number;
  connectionRefused?: boolean;
}

// Only a gateway-confirmed connection-refused counts as hibernating — a tier
// >= 1 service that's reachable but returning a real error must still alarm.
export function isHibernating(svc: TieredServiceHealth): boolean {
  return (svc.tier ?? 0) >= 1 && svc.state === "error" && svc.connectionRefused === true;
}

export function deriveDisplayState(svc: TieredServiceHealth): ServiceDisplayState {
  if (isHibernating(svc)) return "asleep";
  return svc.state;
}

export function isExpectedAbsence(svc: TieredServiceHealth): boolean {
  return Boolean(svc.optional) || isHibernating(svc);
}
