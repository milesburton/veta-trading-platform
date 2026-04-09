import { NON_TRADING_ROLES } from "../../../auth/rbac.ts";
import type { TicketContext } from "../ticket-types";

const ROLE_MESSAGES: Record<string, string> = {
  admin: "Administrators cannot submit orders. This panel is reserved for trader accounts.",
  compliance: "Compliance officers have read-only access. Order submission is disabled.",
  sales: "Sales accounts cannot submit orders directly — use the Sales Workbench to route RFQs.",
  "external-client":
    "External client accounts cannot submit orders directly — use the Client RFQ panel to request quotes.",
  viewer: "View-only access. Contact your administrator to request trading permissions.",
  "desk-head":
    "Desk heads have read-only oversight across the desk. Manual order entry is disabled.",
  "risk-manager":
    "Risk managers have read-only oversight across all desks. Manual order entry is disabled.",
};

const STYLE_BLOCK_MESSAGES: Record<string, string> = {
  low_touch:
    "Low-touch traders do not submit orders via the manual ticket — use the Algo Monitor workspace.",
  fi_voice:
    "Fixed income voice traders submit orders via the Sales Workbench / RFQ flow, not the manual ticket.",
  commodities_voice:
    "Commodities voice traders submit orders via the RFQ flow, not the manual ticket.",
  derivatives_low_touch:
    "Low-touch derivatives traders do not use the manual ticket — use the Algo Monitor workspace.",
};

export function checkRoleLocked(ctx: TicketContext): {
  locked: boolean;
  message: string | null;
} {
  const role = ctx.userRole;
  if (role && NON_TRADING_ROLES.has(role)) {
    return { locked: true, message: ROLE_MESSAGES[role] ?? "Your role cannot submit orders." };
  }
  if (role === "trader") {
    const style = ctx.limits.trading_style;
    if (style && STYLE_BLOCK_MESSAGES[style]) {
      return { locked: true, message: STYLE_BLOCK_MESSAGES[style] };
    }
  }
  return { locked: false, message: null };
}
