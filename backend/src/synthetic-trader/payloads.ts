import { z } from "zod";

export const PricesSchema = z.record(z.string(), z.number());

export const OrderEventDataSchema = z.object({
  clientOrderId: z.string().nullish(),
  remainingQty: z.number().optional(),
});

type OrderEventInterpretation =
  | { kind: "filled"; clientOrderId: string | null | undefined; terminal: boolean }
  | { kind: "terminated"; clientOrderId: string | null | undefined }
  | { kind: "ignored" }
  | { kind: "malformed"; issues: z.ZodIssue[] };

const TERMINATING_TOPICS: ReadonlySet<string> = new Set(["orders.cancelled", "orders.expired"]);

export function interpretOrderEvent(topic: string, data: unknown): OrderEventInterpretation {
  const isFill = topic === "orders.filled";
  if (!isFill && !TERMINATING_TOPICS.has(topic)) return { kind: "ignored" };

  const parsed = OrderEventDataSchema.safeParse(data);
  if (!parsed.success) return { kind: "malformed", issues: parsed.error.issues };

  const { clientOrderId, remainingQty } = parsed.data;
  return isFill
    ? {
        kind: "filled",
        clientOrderId,
        terminal: remainingQty === undefined || remainingQty <= 0,
      }
    : { kind: "terminated", clientOrderId };
}
