import type { OrderBookSnapshot } from "@veta/market-client";
import { computeBookImpactBps } from "./fill-math.ts";
import {
  addOrder,
  bestAsk,
  bestBid,
  createBook,
  matchOrder,
  type MatchResult,
  type OrderBook,
  type RestingOrder,
} from "./order-book.ts";

function toRestingOrders(
  asset: string,
  side: "BUY" | "SELL",
  levels: { price: number; size: number }[],
  now: number,
): RestingOrder[] {
  return levels
    .filter((level) => level.size > 0)
    .map((level, index) => ({
      orderId: `SYN-${asset}-${side}-${index}`,
      asset,
      side,
      price: level.price,
      quantity: level.size,
      remainingQty: level.size,
      enteredAt: now,
      seq: index,
    }));
}

export function bookFromSnapshot(
  asset: string,
  snapshot: OrderBookSnapshot,
  now: number,
): OrderBook {
  let book = createBook(asset);
  for (const order of toRestingOrders(asset, "BUY", snapshot.bids, now)) {
    book = addOrder(book, order);
  }
  for (const order of toRestingOrders(asset, "SELL", snapshot.asks, now)) {
    book = addOrder(book, order);
  }
  return book;
}

export interface MatchAgainstSnapshotResult {
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number | undefined;
  touchPrice: number | undefined;
  impactBps: number;
  fills: MatchResult["fills"];
}

export function matchAgainstSnapshot(
  orderId: string,
  asset: string,
  side: "BUY" | "SELL",
  quantity: number,
  limitPrice: number,
  snapshot: OrderBookSnapshot,
  now: number,
): MatchAgainstSnapshotResult {
  const book = bookFromSnapshot(asset, snapshot, now);
  const incoming: RestingOrder = {
    orderId,
    asset,
    side,
    price: limitPrice,
    quantity,
    remainingQty: quantity,
    enteredAt: now,
    seq: snapshot.bids.length + snapshot.asks.length,
  };

  const result = matchOrder(book, incoming, now, false);
  const notional = result.fills.reduce(
    (sum, fill) => sum + fill.price * fill.matchedQty,
    0,
  );
  const avgFillPrice = result.filledQty > 0
    ? parseFloat((notional / result.filledQty).toFixed(4))
    : undefined;

  const touchPrice = side === "BUY" ? bestAsk(book) : bestBid(book);

  return {
    filledQty: result.filledQty,
    remainingQty: result.remainingQty,
    avgFillPrice,
    touchPrice,
    impactBps: computeBookImpactBps(side, touchPrice, avgFillPrice),
    fills: result.fills,
  };
}
