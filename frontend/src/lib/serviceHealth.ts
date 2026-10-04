import type { ServiceState } from "@veta/frontend/types.ts";

interface PresenceHealth {
  state: ServiceState;
  optional?: boolean;
}

export function isExpectedAbsence(svc: PresenceHealth): boolean {
  return svc.state === "standby" || (Boolean(svc.optional) && svc.state === "error");
}

export function countsAsUp(state: ServiceState): boolean {
  return state === "ok" || state === "standby";
}
