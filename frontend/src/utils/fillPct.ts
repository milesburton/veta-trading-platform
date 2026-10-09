import type { OrderRecord } from "@veta/frontend/types.ts";

export function fillPct(order: Pick<OrderRecord, "filled" | "quantity">): number {
  if (order.quantity <= 0) return 0;
  return Math.min(1, Math.max(0, order.filled / order.quantity));
}
