import type { OrderStatus } from "@veta/frontend/types.ts";

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending:
    "bg-semantic-status-pending/6 text-semantic-status-pending border border-semantic-status-pending/30",
  working:
    "bg-semantic-status-info/6 text-semantic-status-info border border-semantic-status-info/30",
  filled:
    "bg-semantic-status-success/6 text-semantic-status-success border border-semantic-status-success/30",
  expired: "bg-panel/50 text-muted border border-divider/50",
  rejected:
    "bg-semantic-status-critical/6 text-semantic-status-critical border border-semantic-status-critical/30",
  cancelled:
    "bg-semantic-status-warning/6 text-semantic-status-warning border border-semantic-status-warning/30",
  held: "bg-semantic-status-warning/6 text-semantic-status-warning border border-semantic-status-warning/30",
};
