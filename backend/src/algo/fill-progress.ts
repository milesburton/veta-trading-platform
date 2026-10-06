import { z } from "@veta/zod";

export const OrderProgressSchema = z.object({
  orderId: z.string(),
  filledQty: z.number().nonnegative(),
  avgFillPrice: z.number().nonnegative(),
  filledChildIds: z.array(z.string()),
});

export type OrderProgress = z.infer<typeof OrderProgressSchema>;

export type ProgressReader = (orderId: string) => Promise<OrderProgress | null>;

export interface InFlightChild {
  readonly childId: string;
  readonly quantity: number;
  readonly sentAt: number;
}

export interface SliceBudget {
  readonly progress: OrderProgress;
  readonly inFlight: InFlightChild | null;
  readonly remaining: number;
}

export interface TrackedOrder {
  readonly orderId: string;
  readonly clientOrderId?: string;
  readonly asset: string;
  readonly side: "BUY" | "SELL";
  readonly quantity: number;
  readonly expiresAt: number;
}

export type OrderOutcome = "working" | "complete" | "expired";

export const CHILD_SETTLE_MS = Number(Deno.env.get("ALGO_CHILD_SETTLE_MS")) || 3_000;

export function journalBaseUrl(): string {
  const host = Deno.env.get("JOURNAL_HOST") ?? "localhost";
  const port = Deno.env.get("JOURNAL_PORT") ?? "5009";
  return `http://${host}:${port}`;
}

export function createProgressReader(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 2_000
): ProgressReader {
  return async (orderId) => {
    try {
      const res = await fetchFn(
        `${baseUrl}/journal/order/${encodeURIComponent(orderId)}/progress`,
        { signal: AbortSignal.timeout(timeoutMs) }
      );
      if (!res.ok) {
        await res.body?.cancel();
        return null;
      }
      const parsed = OrderProgressSchema.safeParse(await res.json());
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
}

export function settleInFlight(
  inFlight: InFlightChild | null,
  progress: OrderProgress,
  now: number,
  settleMs = CHILD_SETTLE_MS
): InFlightChild | null {
  if (!inFlight) return null;
  if (progress.filledChildIds.includes(inFlight.childId)) return null;
  return now - inFlight.sentAt >= settleMs ? null : inFlight;
}

export function remainingQty(
  quantity: number,
  progress: OrderProgress,
  inFlight: InFlightChild | null
): number {
  return Math.max(0, quantity - progress.filledQty - (inFlight?.quantity ?? 0));
}

export async function readSliceBudget(
  readProgress: ProgressReader,
  orderId: string,
  quantity: number,
  inFlight: InFlightChild | null,
  now: number
): Promise<SliceBudget | null> {
  const progress = await readProgress(orderId);
  if (!progress) return null;
  const settled = settleInFlight(inFlight, progress, now);
  return { progress, inFlight: settled, remaining: remainingQty(quantity, progress, settled) };
}

export function classifyOrder(
  order: TrackedOrder,
  progress: OrderProgress | null,
  now: number
): OrderOutcome {
  if (progress && progress.filledQty >= order.quantity) return "complete";
  return now >= order.expiresAt ? "expired" : "working";
}

export function expiredEvent(
  order: TrackedOrder,
  algo: string,
  progress: OrderProgress | null,
  now: number
) {
  return {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    algo,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    filledQty: progress?.filledQty ?? 0,
    avgFillPrice: progress?.avgFillPrice ?? 0,
    ts: now,
  };
}

export function completeHeartbeat(
  order: TrackedOrder,
  algo: string,
  progress: OrderProgress,
  now: number
) {
  return {
    algo,
    orderId: order.orderId,
    event: "complete",
    asset: order.asset,
    filled: progress.filledQty,
    avgFillPrice: progress.avgFillPrice.toFixed(4),
    ts: now,
  };
}
