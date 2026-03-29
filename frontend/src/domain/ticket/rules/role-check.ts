import type { TicketContext } from "../ticket-types";

const NON_TRADING_ROLES = new Set(["admin", "compliance", "sales", "external-client"]);

const ROLE_MESSAGES: Record<string, string> = {
  admin: "Administrators cannot submit orders. This panel is reserved for trader accounts.",
  compliance: "Compliance officers have read-only access. Order submission is disabled.",
  sales: "Sales accounts cannot submit orders directly.",
  "external-client": "External client accounts cannot submit orders.",
};

export function checkRoleLocked(ctx: TicketContext): {
  locked: boolean;
  message: string | null;
} {
  const role = ctx.userRole;
  if (role && NON_TRADING_ROLES.has(role)) {
    return { locked: true, message: ROLE_MESSAGES[role] ?? "Your role cannot submit orders." };
  }
  return { locked: false, message: null };
}
