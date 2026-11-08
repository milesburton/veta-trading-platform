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

export interface LimitsSnapshot {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
  allowed_desks: string[];
  dark_pool_access: boolean;
}

export function buildLimitsUpdateAuditEvent(
  actor: { id: string; role: string },
  targetUserId: string,
  before: LimitsSnapshot,
  after: LimitsSnapshot,
  ts: number
): AuditEvent {
  return {
    actorId: actor.id,
    actorRole: actor.role,
    action: "account_limits_update",
    target: targetUserId,
    detail: { before, after },
    ts,
  };
}
