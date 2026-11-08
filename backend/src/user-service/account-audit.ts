import type { AuditEvent } from "../lib/audit.ts";

export function buildRegisterAuditEvent(userId: string, archetype: string, ts: number): AuditEvent {
  return {
    actorId: userId,
    actorRole: "trader",
    action: "account_register",
    target: userId,
    detail: { archetype },
    ts,
  };
}
