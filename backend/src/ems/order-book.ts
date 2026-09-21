export interface RestingOrder {
  orderId: string;
  asset: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  remainingQty: number;
  enteredAt: number;
  seq: number;
}

export interface OrderBook {
  asset: string;
  bids: RestingOrder[];
  asks: RestingOrder[];
}

export interface BookFill {
  restingOrderId: string;
  incomingOrderId: string;
  asset: string;
  price: number;
  matchedQty: number;
  ts: number;
}

export interface MatchResult {
  book: OrderBook;
  fills: BookFill[];
  filledQty: number;
  remainingQty: number;
}

export function createBook(asset: string): OrderBook {
  return { asset, bids: [], asks: [] };
}

function insertSorted(side: RestingOrder[], order: RestingOrder, better: (a: RestingOrder, b: RestingOrder) => boolean): RestingOrder[] {
  const next = [...side, order];
  return next.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : a.seq - b.seq));
}

const bidBetter = (a: RestingOrder, b: RestingOrder) => a.price > b.price;
const askBetter = (a: RestingOrder, b: RestingOrder) => a.price < b.price;

export function addOrder(book: OrderBook, order: RestingOrder): OrderBook {
  if (order.side === "BUY") {
    return { ...book, bids: insertSorted(book.bids, order, bidBetter) };
  }
  return { ...book, asks: insertSorted(book.asks, order, askBetter) };
}

export function cancelOrder(book: OrderBook, orderId: string): OrderBook {
  return {
    ...book,
    bids: book.bids.filter((o) => o.orderId !== orderId),
    asks: book.asks.filter((o) => o.orderId !== orderId),
  };
}

/**
 * Matches an incoming order against the resting book using price-time
 * priority: best price first, ties broken by earliest `seq`. Crosses at
 * the resting order's price (standard limit-order-book convention). Any
 * unfilled remainder of the incoming order rests on the book; the caller
 * decides whether to rest it (limit orders) or leave it unfilled (a
 * marketable slice that should not add resting liquidity).
 */
export function matchOrder(
  book: OrderBook,
  incoming: RestingOrder,
  now: number,
  restRemainder: boolean
): MatchResult {
  const contraSide = incoming.side === "BUY" ? book.asks : book.bids;
  const crosses =
    incoming.side === "BUY"
      ? (contra: RestingOrder) => incoming.price >= contra.price
      : (contra: RestingOrder) => incoming.price <= contra.price;

  const better = incoming.side === "BUY" ? askBetter : bidBetter;
  const sorted = [...contraSide].sort((a, b) =>
    better(a, b) ? -1 : better(b, a) ? 1 : a.seq - b.seq
  );

  const fills: BookFill[] = [];
  let remaining = incoming.remainingQty;
  const updatedContra: RestingOrder[] = [];

  for (const contra of sorted) {
    if (remaining <= 0 || !crosses(contra)) {
      updatedContra.push(contra);
      continue;
    }
    const matchedQty = Math.min(remaining, contra.remainingQty);
    remaining -= matchedQty;
    const contraRemaining = contra.remainingQty - matchedQty;

    fills.push({
      restingOrderId: contra.orderId,
      incomingOrderId: incoming.orderId,
      asset: book.asset,
      price: contra.price,
      matchedQty,
      ts: now,
    });

    if (contraRemaining > 0) {
      updatedContra.push({ ...contra, remainingQty: contraRemaining });
    }
  }

  const filledQty = incoming.remainingQty - remaining;
  const nextBook: OrderBook =
    incoming.side === "BUY" ? { ...book, asks: updatedContra } : { ...book, bids: updatedContra };

  const finalBook =
    remaining > 0 && restRemainder
      ? addOrder(nextBook, { ...incoming, remainingQty: remaining })
      : nextBook;

  return { book: finalBook, fills, filledQty, remainingQty: remaining };
}

export function bestBid(book: OrderBook): number | undefined {
  return book.bids[0]?.price;
}

export function bestAsk(book: OrderBook): number | undefined {
  return book.asks[0]?.price;
}

export function depthAtPrice(side: RestingOrder[], price: number): number {
  return side.filter((o) => o.price === price).reduce((sum, o) => sum + o.remainingQty, 0);
}
