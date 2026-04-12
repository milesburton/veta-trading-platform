import { createConsumer } from "@veta/messaging";
import { CORS_HEADERS, corsOptions, json } from "@veta/http";

export function serveAlgoHealth(
  port: number,
  service: string,
  version: string,
  getActiveOrders: () => number,
): void {
  Deno.serve({ port }, (req) => {
    if (req.method === "OPTIONS") return corsOptions();

    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") {
      return json({ service, version, status: "ok", activeOrders: getActiveOrders() });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  });
}

interface ExpirableOrder {
  orderId: string;
  clientOrderId?: string;
  expiresAt: number;
  filledQty: number;
  costBasis: number;
}

export function startExpirySweep<T extends ExpirableOrder>(
  activeOrders: Map<string, T>,
  producer: { send: (topic: string, msg: unknown) => Promise<void> } | null,
  algo: string,
  label: string,
): void {
  setInterval(async () => {
    const now = Date.now();
    for (const order of [...activeOrders.values()]) {
      if (now >= order.expiresAt) {
        const avgFill = order.filledQty > 0
          ? order.costBasis / order.filledQty
          : 0;
        console.log(
          `[${label}] Expiry sweep: ${order.orderId} filled=${order.filledQty}`,
        );
        activeOrders.delete(order.orderId);
        await producer?.send("orders.expired", {
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          algo,
          filledQty: order.filledQty,
          avgFillPrice: order.filledQty > 0 ? avgFill : 0,
          ts: now,
        }).catch(() => {});
      }
    }
  }, 5_000);
}

export function startExpirySweepIndexed<T extends Omit<ExpirableOrder, never>>(
  activeOrders: Map<number, T>,
  producer: { send: (topic: string, msg: unknown) => Promise<void> } | null,
  algo: string,
  label: string,
): void {
  setInterval(async () => {
    const now = Date.now();
    for (const [id, order] of [...activeOrders.entries()]) {
      if (now >= order.expiresAt) {
        const avgFill = order.filledQty > 0
          ? order.costBasis / order.filledQty
          : 0;
        console.log(
          `[${label}] Expiry sweep: ${order.orderId} filled=${order.filledQty}`,
        );
        activeOrders.delete(id);
        await producer?.send("orders.expired", {
          orderId: order.orderId,
          clientOrderId: order.clientOrderId,
          algo,
          filledQty: order.filledQty,
          avgFillPrice: order.filledQty > 0 ? avgFill : 0,
          ts: now,
        }).catch(() => {});
      }
    }
  }, 5_000);
}

export function subscribeNewsSignals(
  groupId: string,
  label: string,
): void {
  createConsumer(groupId, ["news.signal"]).then((consumer) => {
    consumer.onMessage((_topic, raw) => {
      const sig = raw as { symbol: string; sentiment: string; score: number };
      console.log(
        `[${label}] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`,
      );
    });
  }).catch(() => {}); // non-fatal
}
