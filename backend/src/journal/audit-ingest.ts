import { type AuditEvent, AuditEventSchema } from "../lib/audit.ts";
import { OrderKillAuditSchema, OrderResumeAuditSchema } from "../schemas/orders.ts";

export const AUDIT_TOPICS = ["audit.events", "orders.kill.audit", "orders.resume.audit"] as const;

function scopeTarget(event: { scope: string; scopeValue?: string; targetUserId?: string }): string {
  const value = event.scopeValue ?? event.targetUserId;
  return value ? `${event.scope}:${value}` : event.scope;
}

export function toAuditEvent(topic: string, raw: unknown): AuditEvent | null {
  if (topic === "audit.events") {
    const parsed = AuditEventSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
  if (topic === "orders.kill.audit") {
    const parsed = OrderKillAuditSchema.safeParse(raw);
    if (!parsed.success) return null;
    const e = parsed.data;
    return {
      actorId: e.issuedBy,
      actorRole: e.issuedByRole,
      action: "orders_kill",
      target: scopeTarget(e),
      detail: { scope: e.scope, scopeValue: e.scopeValue, cancelledCount: e.cancelledCount },
      ts: e.ts,
    };
  }
  if (topic === "orders.resume.audit") {
    const parsed = OrderResumeAuditSchema.safeParse(raw);
    if (!parsed.success) return null;
    const e = parsed.data;
    return {
      actorId: e.issuedBy,
      actorRole: e.issuedByRole,
      action: "orders_resume",
      target: scopeTarget(e),
      detail: { scope: e.scope, scopeValue: e.scopeValue },
      ts: e.ts,
    };
  }
  return null;
}
