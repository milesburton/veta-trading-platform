import { NON_TRADING_ROLES } from "../../../auth/rbac.ts";
import type { TicketContext } from "../ticket-types";

const ROLE_MESSAGES: Record<string, string> = {
  admin: "Administrators cannot submit orders. This panel is reserved for trader accounts.",
  compliance: "Compliance officers have read-only access. Order submission is disabled.",
  sales: "Sales accounts cannot submit orders directly.",
  "external-client": "External client accounts cannot submit orders.",
  viewer: "View-only access. Contact your administrator to request trading permissions.",
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
